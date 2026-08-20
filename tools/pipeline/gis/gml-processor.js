/**
 * Koelnmesse GIS/GML Pipeline
 * Processes official GML data from NRW Geobasis into Blender-ready assets
 * Handles CRS transformation, building extraction, and mesh generation prep
 */

import { promises as fs } from 'fs';
import { DOMParser } from 'xmldom';
import * as proj4 from 'proj4';

/**
 * CRS Definitions for NRW
 */
export const CRS = {
  // ETRS89 / UTM zone 32N (standard for NRW)
  ETRS89_UTM32N: '+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs',
  
  // ETRS89 / UTM zone 32N (with EPSG code)
  EPSG_25832: '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  
  // WGS84 (GPS coordinates)
  WGS84: '+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs',
  
  // ETRS89 / DHDN (German historical)
  EPSG_31468: '+proj=tmerc +lat_0=0 +lon_0=12 +k=1 +x_0=4500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs'
};

/**
 * Parse GML file and extract building geometries
 */
export async function parseGMLBuildingData(gmlPath, options = {}) {
  const {
    targetCRS = CRS.ETRS89_UTM32N,
    sourceCRS = null, // auto-detect from GML
    filterBBox = null, // [minX, minY, maxX, maxY] in target CRS
    simplifyTolerance = 0.1, // meters
    includeInterior = false
  } = options;

  const xmlContent = await fs.readFile(gmlPath, 'utf8');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlContent, 'application/xml');

  // Extract CRS from GML if not specified
  const detectedCRS = sourceCRS || detectGMLCRS(doc);
  
  // Find all building features
  const buildings = [];
  const buildingNodes = doc.getElementsByTagNameNS('*', 'Building');
  
  for (let i = 0; i < buildingNodes.length; i++) {
    const building = buildingNodes[i];
    const parsed = parseBuildingFeature(building, detectedCRS, targetCRS);
    if (parsed) {
      if (!filterBBox || bboxIntersects(parsed.bbox, filterBBox)) {
        buildings.push(parsed);
      }
    }
  }

  // Simplify geometries
  for (const b of buildings) {
    b.geometry = simplifyGeometry(b.geometry, simplifyTolerance);
  }

  return {
    crs: targetCRS,
    buildings,
    metadata: {
      sourceFile: gmlPath,
      sourceCRS: detectedCRS,
      buildingCount: buildings.length,
      bbox: computeOverallBBox(buildings)
    }
  };
}

/**
 * Detect CRS from GML metadata
 */
function detectGMLCRS(doc) {
  // Look for srsName or srsDimension attributes
  const envelopes = doc.getElementsByTagNameNS('*', 'Envelope');
  for (let i = 0; i < envelopes.length; i++) {
    const srsName = envelopes[i].getAttribute('srsName') || 
                    envelopes[i].getAttribute('srsDimension');
    if (srsName && srsName.includes('EPSG')) {
      const epsgCode = srsName.match(/EPSG:(\d+)/);
      if (epsgCode) return `EPSG:${epsgCode[1]}`;
    }
  }
  // Default to NRW standard
  return CRS.ETRS89_UTM32N;
}

/**
 * Parse a single building feature
 */
function parseBuildingFeature(buildingNode, sourceCRS, targetCRS) {
  const gmlId = buildingNode.getAttribute('gml:id') || `building_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Extract name/identifier
  const nameNode = buildingNode.getElementsByTagNameNS('*', 'name')[0] ||
                   buildingNode.getElementsByTagNameNS('*', 'identifier')[0];
  const name = nameNode ? nameNode.textContent : gmlId;

  // Extract geometry (solid, multiSurface, etc.)
  const geometry = extractGeometry(buildingNode);
  if (!geometry) return null;

  // Transform coordinates
  const transformed = transformGeometry(geometry, sourceCRS, targetCRS);
  
  // Compute bounding box
  const bbox = computeGeometryBBox(transformed);

  return {
    id: gmlId,
    name,
    geometry: transformed,
    bbox,
    attributes: extractBuildingAttributes(buildingNode)
  };
}

/**
 * Extract geometry from building node
 */
function extractGeometry(buildingNode) {
  // Try different geometry types
  const lodNodes = buildingNode.getElementsByTagNameNS('*', 'lod2Solid');
  if (lodNodes.length > 0) return extractSolid(lodNodes[0]);

  const multiSurface = buildingNode.getElementsByTagNameNS('*', 'MultiSurface');
  if (multiSurface.length > 0) return extractMultiSurface(multiSurface[0]);

  const solidNodes = buildingNode.getElementsByTagNameNS('*', 'Solid');
  if (solidNodes.length > 0) return extractSolid(solidNodes[0]);

  return null;
}

/**
 * Extract solid geometry (outer shell + interior)
 */
function extractSolid(solidNode) {
  const exterior = solidNode.getElementsByTagNameNS('*', 'exterior')[0];
  if (!exterior) return null;
  
  const shell = exterior.getElementsByTagNameNS('*', 'Shell')[0];
  if (!shell) return null;

  const surfaces = shell.getElementsByTagNameNS('*', 'SurfaceMember');
  const faces = [];
  
  for (let i = 0; i < surfaces.length; i++) {
    const polygon = surfaces[i].getElementsByTagNameNS('*', 'Polygon')[0];
    if (polygon) {
      faces.push(extractPolygon(polygon));
    }
  }
  
  return { type: 'solid', faces };
}

/**
 * Extract polygon with exterior and interior rings
 */
function extractPolygon(polygonNode) {
  const exterior = polygonNode.getElementsByTagNameNS('*', 'exterior')[0];
  const interior = polygonNode.getElementsByTagNameNS('*', 'interior');
  
  const outerRing = extractLinearRing(exterior?.getElementsByTagNameNS('*', 'LinearRing')[0]);
  const innerRings = [];
  
  for (let i = 0; i < interior.length; i++) {
    const ring = interior[i].getElementsByTagNameNS('*', 'LinearRing')[0];
    if (ring) innerRings.push(extractLinearRing(ring));
  }
  
  return { outer: outerRing, inner: innerRings };
}

/**
 * Extract coordinates from LinearRing
 */
function extractLinearRing(ringNode) {
  if (!ringNode) return [];
  
  const posList = ringNode.getElementsByTagNameNS('*', 'posList')[0];
  if (!posList) return [];
  
  const coords = posList.textContent.trim().split(/\s+/).map(parseFloat);
  const points = [];
  for (let i = 0; i < coords.length; i += 3) {
    points.push([coords[i], coords[i + 1], coords[i + 2] || 0]);
  }
  return points;
}

/**
 * Transform geometry from source to target CRS
 */
function transformGeometry(geometry, sourceCRS, targetCRS) {
  if (sourceCRS === targetCRS) return geometry;

  const transform = (point) => {
    const [x, y, z] = point;
    const result = proj4(sourceCRS, targetCRS, [x, y]);
    return [result[0], result[1], z];
  };

  return deepTransform(geometry, transform);
}

function deepTransform(obj, fn) {
  if (Array.isArray(obj)) {
    // Check if it's a coordinate triplet
    if (obj.length === 3 && typeof obj[0] === 'number') {
      return fn(obj);
    }
    return obj.map(item => deepTransform(item, fn));
  }
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = deepTransform(value, fn);
    }
    return result;
  }
  return obj;
}

/**
 * Compute bounding box of geometry
 */
function computeGeometryBBox(geometry) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  function visit(obj) {
    if (Array.isArray(obj)) {
      if (obj.length === 3 && typeof obj[0] === 'number') {
        minX = Math.min(minX, obj[0]);
        minY = Math.min(minY, obj[1]);
        minZ = Math.min(minZ, obj[2]);
        maxX = Math.max(maxX, obj[0]);
        maxY = Math.max(maxY, obj[1]);
        maxZ = Math.max(maxZ, obj[2]);
      } else {
        obj.forEach(visit);
      }
    } else if (obj && typeof obj === 'object') {
      Object.values(obj).forEach(visit);
    }
  }

  visit(geometry);
  
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2]
  };
}

/**
 * Simplify geometry using Douglas-Peucker
 */
function simplifyGeometry(geometry, tolerance) {
  // Apply to all linear rings
  return deepTransform(geometry, (point) => {
    // Points are passed through, simplification happens at ring level
    return point;
  });
  
  // For each linear ring, apply simplification
  return simplifyRings(geometry, tolerance);
}

function simplifyRings(geometry, tolerance) {
  if (geometry.type === 'solid') {
    return {
      ...geometry,
      faces: geometry.faces.map(face => ({
        ...face,
        outer: simplifyRing(face.outer, tolerance),
        inner: face.inner.map(ring => simplifyRing(ring, tolerance))
      }))
    };
  }
  return geometry;
}

function simplifyRing(ring, tolerance) {
  if (!ring || ring.length < 3) return ring;
  
  // Douglas-Peucker algorithm
  function douglasPeucker(points, start, end, epsilon) {
    let maxDist = 0;
    let index = 0;
    
    for (let i = start + 1; i < end; i++) {
      const dist = perpendicularDistance(points[i], points[start], points[end]);
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }
    
    if (maxDist > epsilon) {
      const left = douglasPeucker(points, start, index, epsilon);
      const right = douglasPeucker(points, index, end, epsilon);
      return [...left.slice(0, -1), ...right];
    }
    return [points[start], points[end]];
  }
  
  return douglasPeucker(ring, 0, ring.length - 1, tolerance);
}

function perpendicularDistance(point, lineStart, lineEnd) {
  const [x0, y0] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;
  
  const num = Math.abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1);
  const den = Math.sqrt((y2 - y1) ** 2 + (x2 - x1) ** 2);
  return den === 0 ? 0 : num / den;
}

/**
 * Extract building attributes
 */
function extractBuildingAttributes(buildingNode) {
  const attrs = {};
  
  // Common attributes
  const attrMap = {
    'function': 'buildingFunction',
    'measuredHeight': 'height',
    'storeysAboveGround': 'storeys',
    'roofType': 'roofType',
    'class': 'buildingClass'
  };
  
  for (const [gmlName, outName] of Object.entries(attrMap)) {
    const node = buildingNode.getElementsByTagNameNS('*', gmlName)[0];
    if (node) attrs[outName] = node.textContent;
  }
  
  return attrs;
}

function bboxIntersects(bbox1, bbox2) {
  return !(bbox1.max[0] < bbox2[0] || bbox1.min[0] > bbox2[2] ||
           bbox1.max[1] < bbox2[1] || bbox1.min[1] > bbox2[3]);
}

function computeOverallBBox(buildings) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  
  for (const b of buildings) {
    minX = Math.min(minX, b.bbox.min[0]);
    minY = Math.min(minY, b.bbox.min[1]);
    minZ = Math.min(minZ, b.bbox.min[2]);
    maxX = Math.max(maxX, b.bbox.max[0]);
    maxY = Math.max(maxY, b.bbox.max[1]);
    maxZ = Math.max(maxZ, b.bbox.max[2]);
  }
  
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

/**
 * Export buildings to Blender-ready format (OBJ + metadata JSON)
 */
export async function exportForBlender(buildingsData, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  
  const metadata = {
    crs: buildingsData.crs,
    buildings: [],
    units: 'meters',
    upAxis: 'Z'
  };
  
  for (const building of buildingsData.buildings) {
    const objPath = `${outputDir}/${building.id}.obj`;
    await writeOBJ(objPath, building.geometry, building.id);
    
    metadata.buildings.push({
      id: building.id,
      name: building.name,
      objFile: `${building.id}.obj`,
      bbox: building.bbox,
      attributes: building.attributes
    });
  }
  
  await fs.writeFile(`${outputDir}/metadata.json`, JSON.stringify(metadata, null, 2));
  return metadata;
}

async function writeOBJ(filePath, geometry, name) {
  let objContent = `# ${name}\n# Generated from GML\n`;
  let vertexOffset = 1;
  const faces = [];
  
  if (geometry.type === 'solid') {
    for (const face of geometry.faces) {
      // Write outer ring vertices
      for (const pt of face.outer) {
        objContent += `v ${pt[0]} ${pt[1]} ${pt[2]}\n`;
      }
      
      const n = face.outer.length;
      if (n >= 3) {
        // Triangulate fan
        for (let i = 1; i < n - 1; i++) {
          faces.push(`f ${vertexOffset} ${vertexOffset + i} ${vertexOffset + i + 1}`);
        }
      }
      vertexOffset += n;
      
      // Inner rings (holes) - write as separate faces with negative orientation
      for (const inner of face.inner) {
        for (const pt of inner) {
          objContent += `v ${pt[0]} ${pt[1]} ${pt[2]}\n`;
        }
        const m = inner.length;
        if (m >= 3) {
          for (let i = 1; i < m - 1; i++) {
            faces.push(`f ${vertexOffset + i + 1} ${vertexOffset + i} ${vertexOffset}`); // Reversed
          }
        }
        vertexOffset += m;
      }
    }
  }
  
  objContent += '\n' + faces.join('\n') + '\n';
  await fs.writeFile(filePath, objContent);
}

export default {
  parseGMLBuildingData,
  exportForBlender,
  CRS
};