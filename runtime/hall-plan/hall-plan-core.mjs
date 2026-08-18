// Core data structures for SHADED's PLAN → HALL workflow
// Implements the technical hall/building plan to structural 3D hall conversion

const EPS = 1e-9;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Represents a 2D point in plan coordinates
 */
export class PlanPoint {
  constructor(x, y) {
    this.x = x; // Plan X coordinate (meters in plan space)
    this.y = y; // Plan Y coordinate (meters in plan space)
  }

  /**
   * Calculate distance to another point
   * @param {PlanPoint} other - Other point
   * @returns {number} - Distance in meters
   */
  distanceTo(other) {
    return Math.hypot(this.x - other.x, this.y - other.y);
  }

  /**
   * Create a copy of this point
   * @returns {PlanPoint} - New point with same coordinates
   */
  clone() {
    return new PlanPoint(this.x, this.y);
  }

  /**
   * Convert to array format [x, y]
   * @returns {[number, number]} - Array representation
   */
  toArray() {
    return [this.x, this.y];
  }
}

/**
 * Represents a 2D vector in plan coordinates
 */
export class PlanVector {
  constructor(dx, dy) {
    this.dx = dx; // X component
    this.dy = dy; // Y component
  }

  /**
   * Calculate magnitude (length) of vector
   * @returns {number} - Magnitude
   */
  magnitude() {
    return Math.hypot(this.dx, this.dy);
  }

  /**
   * Normalize vector to unit length
   * @returns {PlanVector} - Normalized vector
   */
  normalize() {
    const mag = this.magnitude();
    if (mag > EPS) {
      return new PlanVector(this.dx / mag, this.dy / mag);
    }
    return new PlanVector(0, 0);
  }

  /**
   * Calculate dot product with another vector
   * @param {PlanVector} other - Other vector
   * @returns {number} - Dot product
   */
  dot(other) {
    return this.dx * other.dx + this.dy * other.dy;
  }

  /**
   * Calculate cross product (z-component) with another vector
   * @param {PlanVector} other - Other vector
   * @returns {number} - Cross product (z-component)
   */
  cross(other) {
    return this.dx * other.dy - this.dy * other.dx;
  }

  /**
   * Create a copy of this vector
   * @returns {PlanVector} - New vector with same components
   */
  clone() {
    return new PlanVector(this.dx, this.dy);
  }
}

/**
 * Represents a line segment in plan coordinates
 */
export class PlanLine {
  constructor(start, end) {
    this.start = start; // PlanPoint
    this.end = end;   // PlanPoint
  }

  /**
   * Calculate length of line segment
   * @returns {number} - Length in meters
   */
  length() {
    return this.start.distanceTo(this.end);
  }

  /**
   * Calculate midpoint of line segment
   * @returns {PlanPoint} - Midpoint
   */
  midpoint() {
    return new PlanPoint(
      (this.start.x + this.end.x) / 2,
      (this.start.y + this.end.y) / 2
    );
  }

  /**
   * Check if point is on line segment (within tolerance)
   * @param {PlanPoint} point - Point to check
   * @param {number} tolerance - Tolerance in meters
   * @returns {boolean} - True if point is on line segment
   */
  containsPoint(point, tolerance = EPS) {
    // Check if point is collinear with line segment
    const lineVec = new PlanVector(this.end.x - this.start.x, this.end.y - this.start.y);
    const pointVec = new PlanVector(point.x - this.start.x, point.y - this.start.y);
    
    // Cross product should be zero for collinear points
    const cross = Math.abs(lineVec.cross(pointVec));
    if (cross > tolerance * lineVec.magnitude()) {
      return false;
    }
    
    // Check if point is between start and end
    const dotProduct = lineVec.dot(pointVec);
    const squaredLength = lineVec.magnitude() * lineVec.magnitude();
    
    return dotProduct >= -tolerance && dotProduct <= squaredLength + tolerance;
  }

  /**
   * Calculate distance from point to line segment
   * @param {PlanPoint} point - Point to measure distance to
   * @returns {number} - Distance in meters
   */
  distanceToPoint(point) {
    const lineVec = new PlanVector(this.end.x - this.start.x, this.end.y - this.start.y);
    const pointVec = new PlanVector(point.x - this.start.x, point.y - this.start.y);
    
    const lineLengthSq = lineVec.magnitude() * lineVec.magnitude();
    if (lineLengthSq === 0) {
      return pointVec.magnitude();
    }
    
    const t = Math.max(0, Math.min(1, pointVec.dot(lineVec) / lineLengthSq));
    const projection = new PlanPoint(
      this.start.x + t * lineVec.dx,
      this.start.y + t * lineVec.dy
    );
    
    return point.distanceTo(projection);
  }

  /**
   * Create a copy of this line segment
   * @returns {PlanLine} - New line segment with same endpoints
   */
  clone() {
    return new PlanLine(this.start.clone(), this.end.clone());
  }
}

/**
 * Represents a rectangle in plan coordinates
 */
export class PlanRectangle {
  constructor(center, width, height, rotation = 0) {
    this.center = center; // PlanPoint
    this.width = width;   // Width in meters
    this.height = height; // Height in meters
    this.rotation = rotation; // Rotation in radians
  }

  /**
   * Calculate the four corners of the rectangle
   * @returns {[PlanPoint, PlanPoint, PlanPoint, PlanPoint]} - Corners in clockwise order starting from top-left
   */
  getCorners() {
    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;
    
    // Corners relative to center (before rotation)
    const localCorners = [
      new PlanPoint(-halfWidth, -halfHeight), // top-left
      new PlanPoint(halfWidth, -halfHeight),  // top-right
      new PlanPoint(halfWidth, halfHeight),   // bottom-right
      new PlanPoint(-halfWidth, halfHeight)   // bottom-left
    ];
    
    // Apply rotation
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    
    return localCorners.map(corner => {
      const rotatedX = corner.x * cos - corner.y * sin + this.center.x;
      const rotatedY = corner.x * sin + corner.y * cos + this.center.y;
      return new PlanPoint(rotatedX, rotatedY);
    });
  }

  /**
   * Check if point is inside rectangle
   * @param {PlanPoint} point - Point to check
   * @returns {boolean} - True if point is inside rectangle
   */
  containsPoint(point) {
    // Transform point to rectangle's local coordinate system
    const dx = point.x - this.center.x;
    const dy = point.y - this.center.y;
    
    const cos = Math.cos(-this.rotation); // Negative rotation for inverse transform
    const sin = Math.sin(-this.rotation);
    
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    
    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;
    
    return Math.abs(localX) <= halfWidth && Math.abs(localY) <= halfHeight;
  }

  /**
   * Calculate area of rectangle
   * @returns {number} - Area in square meters
   */
  area() {
    return this.width * this.height;
  }

  /**
   * Create a copy of this rectangle
   * @returns {PlanRectangle} - New rectangle with same properties
   */
  clone() {
    return new PlanRectangle(this.center.clone(), this.width, this.height, this.rotation);
  }
}

/**
 * Represents a polygon in plan coordinates
 */
export class PlanPolygon {
  constructor(points) {
    this.points = points; // Array of PlanPoint objects
  }

  /**
   * Calculate area of polygon using shoelace formula
   * @returns {number} - Area in square meters
   */
  area() {
    if (this.points.length < 3) {
      return 0;
    }
    
    let area = 0;
    const n = this.points.length;
    
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += this.points[i].x * this.points[j].y;
      area -= this.points[j].x * this.points[i].y;
    }
    
    return Math.abs(area) / 2;
  }

  /**
   * Calculate bounding box of polygon
   * @returns {{min: PlanPoint, max: PlanPoint}} - Bounding box
   */
  getBounds() {
    if (this.points.length === 0) {
      return { min: new PlanPoint(0, 0), max: new PlanPoint(0, 0) };
    }
    
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    for (const point of this.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    
    return {
      min: new PlanPoint(minX, minY),
      max: new PlanPoint(maxX, maxY)
    };
  }

  /**
   * Check if point is inside polygon using ray casting algorithm
   * @param {PlanPoint} point - Point to check
   * @returns {boolean} - True if point is inside polygon
   */
  containsPoint(point) {
    if (this.points.length < 3) {
      return false;
    }
    
    let inside = false;
    const n = this.points.length;
    
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const pi = this.points[i];
      const pj = this.points[j];
      
      if (((pi.y > point.y) !== (pj.y > point.y)) &&
          (point.x < (pj.x - pi.x) * (point.y - pi.y) / (pj.y - pi.y) + pi.x)) {
        inside = !inside;
      }
    }
    
    return inside;
  }

  /**
   * Create a copy of this polygon
   * @returns {PlanPolygon} - New polygon with same points
   */
  clone() {
    return new PlanPolygon(this.points.map(point => point.clone()));
  }
}

/**
 * Represents a line detected in the plan image
 */
export class DetectedLine {
  constructor(start, end, confidence, thickness = 1.0) {
    this.start = start; // PlanPoint
    this.end = end;   // PlanPoint
    this.confidence = confidence; // Detection confidence (0-1)
    this.thickness = thickness; // Line thickness in pixels
  }

  /**
   * Get line as PlanLine
   * @returns {PlanLine} - Line representation
   */
  toPlanLine() {
    return new PlanLine(this.start, this.end);
  }

  /**
   * Calculate line length
   * @returns {number} - Length in meters
   */
  length() {
    return this.start.distanceTo(this.end);
  }

  /**
   * Create a copy of this detected line
   * @returns {DetectedLine} - New detected line with same properties
   */
  clone() {
    return new DetectedLine(
      this.start.clone(),
      this.end.clone(),
      this.confidence,
      this.thickness
    );
  }
}

/**
 * Represents a detected rectangle in the plan image
 */
export class DetectedRectangle {
  constructor(center, width, height, rotation = 0, confidence = 1.0) {
    this.center = center; // PlanPoint
    this.width = width;   // Width in meters
    this.height = height; // Height in meters
    this.rotation = rotation; // Rotation in radians
    this.confidence = confidence; // Detection confidence (0-1)
  }

  /**
   * Get rectangle as PlanRectangle
   * @returns {PlanRectangle} - Rectangle representation
   */
  toPlanRectangle() {
    return new PlanRectangle(this.center, this.width, this.height, this.rotation);
  }

  /**
   * Calculate area
   * @returns {number} - Area in square meters
   */
  area() {
    return this.width * this.height;
  }

  /**
   * Create a copy of this detected rectangle
   * @returns {DetectedRectangle} - New detected rectangle with same properties
   */
  clone() {
    return new DetectedRectangle(
      this.center.clone(),
      this.width,
      this.height,
      this.rotation,
      this.confidence
    );
  }
}

/**
 * Represents a semantic hall element
 */
export class HallElement {
  constructor(id, type, properties = {}) {
    this.id = id;           // Unique identifier
    this.type = type;       // Element type (column, wall, etc.)
    this.properties = properties; // Element-specific properties
    this.visible = true;    // Whether element is visible in viewport
    this.locked = false;    // Whether element is locked from editing
  }

  /**
   * Get property value with fallback
   * @param {string} key - Property key
   * @param {*} defaultValue - Default value if property not found
   * @returns {*} - Property value or default
   */
  getProp(key, defaultValue = null) {
    return this.properties[key] !== undefined ? this.properties[key] : defaultValue;
  }

  /**
   * Set property value
   * @param {string} key - Property key
   * @param {*} value - Value to set
   */
  setProp(key, value) {
    this.properties[key] = value;
  }

  /**
   * Create a copy of this hall element
   * @returns {HallElement} - New hall element with same properties
   */
  clone() {
    return new HallElement(this.id, this.type, JSON.parse(JSON.stringify(this.properties)));
  }
}

/**
 * Represents a structural column in the hall
 */
export class HallColumn extends HallElement {
  constructor(id, position, footprint, height, properties = {}) {
    super(id, 'column', properties);
    this.position = position; // PlanPoint - base center position
    this.footprint = footprint; // [width, depth] in meters
    this.height = height;     // Height in meters
    
    // Set default properties if not provided
    if (!this.getProp('height')) {
      this.setProp('height', height);
    }
    if (!this.getProp('footprint')) {
      this.setProp('footprint', footprint);
    }
  }

  /**
   * Get the 3D bounding box of this column
   * @returns {{min: [number, number, number], max: [number, number, number]}} - 3D bounding box
   */
  getBoundingBox() {
    const halfWidth = this.footprint[0] / 2;
    const halfDepth = this.footprint[1] / 2;
    
    return {
      min: [
        this.position.x - halfWidth,
        0, // Base at y=0
        this.position.y - halfDepth
      ],
      max: [
        this.position.x + halfWidth,
        this.height,
        this.position.y + halfDepth
      ]
    };
  }

  /**
   * Create a copy of this hall column
   * @returns {HallColumn} - New hall column with same properties
   */
  clone() {
    return new HallColumn(
      this.id,
      this.position.clone(),
      [...this.footprint],
      this.height,
      JSON.parse(JSON.stringify(this.properties))
    );
  }
}

/**
 * Represents a structural wall in the hall
 */
export class HallWall extends HallElement {
  constructor(id, footprint, height, properties = {}) {
    super(id, 'wall', properties);
    this.footprint = footprint; // Array of PlanPoint objects defining wall path
    this.height = height;       // Height in meters
    
    // Set default properties if not provided
    if (!this.getProp('height')) {
      this.setProp('height', height);
    }
    if (!this.getProp('footprint')) {
      this.setProp('footprint', footprint);
    }
  }

  /**
   * Get the 3D bounding box of this wall
   * @returns {{min: [number, number, number], max: [number, number, number]}} - 3D bounding box
   */
  getBoundingBox() {
    if (this.footprint.length === 0) {
      return { min: [0, 0, 0], max: [0, 0, 0] };
    }
    
    let minX = Infinity, minY = 0, minZ = Infinity;
    let maxX = -Infinity, maxY = this.height, maxZ = -Infinity;
    
    // Assume wall thickness of 0.2m if not specified
    const wallThickness = this.getProp('thickness', 0.2);
    const halfThickness = wallThickness / 2;
    
    for (const point of this.footprint) {
      minX = Math.min(minX, point.x - halfThickness);
      maxX = Math.max(maxX, point.x + halfThickness);
      minZ = Math.min(minZ, point.y - halfThickness);
      maxZ = Math.max(maxZ, point.y + halfThickness);
    }
    
    return {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ]
    };
  }

  /**
   * Calculate wall length
   * @returns {number} - Length in meters
   */
  length() {
    if (this.footprint.length < 2) {
      return 0;
    }
    
    let length = 0;
    for (let i = 0; i < this.footprint.length - 1; i++) {
      length += this.footprint[i].distanceTo(this.footprint[i + 1]);
    }
    
    return length;
  }

  /**
   * Create a copy of this hall wall
   * @returns {HallWall} - New hall wall with same properties
   */
  clone() {
    return new HallWall(
      this.id,
      this.footprint.map(point => point.clone()),
      this.height,
      JSON.parse(JSON.stringify(this.properties))
    );
  }
}

/**
 * Represents a structural core in the hall (elevator shaft, stairwell, etc.)
 */
export class HallCore extends HallElement {
  constructor(id, footprint, height, properties = {}) {
    super(id, 'core', properties);
    this.footprint = footprint; // Array of PlanPoint objects defining core boundary
    this.height = height;       // Height in meters
    
    // Set default properties if not provided
    if (!this.getProp('height')) {
      this.setProp('height', height);
    }
    if (!this.getProp('footprint')) {
      this.setProp('footprint', footprint);
    }
  }

  /**
   * Get the 3D bounding box of this core
   * @returns {{min: [number, number, number], max: [number, number, number]}} - 3D bounding box
   */
  getBoundingBox() {
    if (this.footprint.length === 0) {
      return { min: [0, 0, 0], max: [0, 0, 0] };
    }
    
    let minX = Infinity, minY = 0, minZ = Infinity;
    let maxX = -Infinity, maxY = this.height, maxZ = -Infinity;
    
    for (const point of this.footprint) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.y);
      maxZ = Math.max(maxZ, point.y);
    }
    
    return {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ]
    };
  }

  /**
   * Calculate area of core footprint
   * @returns {number} - Area in square meters
   */
  area() {
    const polygon = new PlanPolygon(this.footprint);
    return polygon.area();
  }

  /**
   * Create a copy of this hall core
   * @returns {HallCore} - New hall core with same properties
   */
  clone() {
    return new HallCore(
      this.id,
      this.footprint.map(point => point.clone()),
      this.height,
      JSON.parse(JSON.stringify(this.properties))
    );
  }
}

/**
 * Represents a portal (door/window opening) in the hall
 */
export class HallPortal extends HallElement {
  constructor(id, position, width, height, properties = {}) {
    super(id, 'portal', properties);
    this.position = position; // PlanPoint - center of portal
    this.width = width;       // Width in meters
    this.height = height;     // Height in meters (from floor)
    
    // Set default properties if not provided
    if (!this.getProp('width')) {
      this.setProp('width', width);
    }
    if (!this.getProp('height')) {
      this.setProp('height', height);
    }
  }

  /**
   * Get the 3D bounding box of this portal
   * @returns {{min: [number, number, number], max: [number, number, number]}} - 3D bounding box
   */
  getBoundingBox() {
    const halfWidth = this.width / 2;
    
    return {
      min: [
        this.position.x - halfWidth,
        0, // Base at floor level
        this.position.y
      ],
      max: [
        this.position.x + halfWidth,
        this.height,
        this.position.y
      ]
    };
  }

  /**
   * Create a copy of this hall portal
   * @returns {HallPortal} - New hall portal with same properties
   */
  clone() {
    return new HallPortal(
      this.id,
      this.position.clone(),
      this.width,
      this.height,
      JSON.parse(JSON.stringify(this.properties))
    );
  }
}

/**
 * Represents a stair connection between levels
 */
export class HallStair extends HallElement {
  constructor(id, position, width, connectedLevelA, connectedLevelB, heightDifference, properties = {}) {
    super(id, 'stair', properties);
    this.position = position;           // PlanPoint - base of stair
    this.width = width;                 // Width in meters
    this.connectedLevelA = connectedLevelA; // Level identifier
    this.connectedLevelB = connectedLevelB; // Level identifier
    this.heightDifference = heightDifference; // Height difference in meters
    
    // Set default properties if not provided
    if (!this.getProp('width')) {
      this.setProp('width', width);
    }
    if (!this.getProp('connectedLevelA')) {
      this.setProp('connectedLevelA', connectedLevelA);
    }
    if (!this.getProp('connectedLevelB')) {
      this.setProp('connectedLevelB', connectedLevelB);
    }
    if (!this.getProp('heightDifference')) {
      this.setProp('heightDifference', heightDifference);
    }
  }

  /**
   * Get the 3D bounding box of this stair
   * @returns {{min: [number, number, number], max: [number, number, number]}} - 3D bounding box
   */
  getBoundingBox() {
    const halfWidth = this.width / 2;
    const depth = 1.0; // Assume 1m depth for stairs
    const halfDepth = depth / 2;
    const bottomY = Math.min(0, this.heightDifference);
    const topY = Math.max(0, this.heightDifference);
    
    return {
      min: [
        this.position.x - halfWidth,
        bottomY,
        this.position.y - halfDepth
      ],
      max: [
        this.position.x + halfWidth,
        topY,
        this.position.y + halfDepth
      ]
    };
  }

  /**
   * Create a copy of this hall stair
   * @returns {HallStair} - New hall stair with same properties
   */
  clone() {
    return new HallStair(
      this.id,
      this.position.clone(),
      this.width,
      this.connectedLevelA,
      this.connectedLevelB,
      this.heightDifference,
      JSON.parse(JSON.stringify(this.properties))
    );
  }
}

/**
 * Represents an escalator connection between levels
 */
export class HallEscalator extends HallElement {
  constructor(id, position, width, connectedLevelA, connectedLevelB, heightDifference, properties = {}) {
    super(id, 'escalator', properties);
    this.position = position;           // PlanPoint - base of escalator
    this.width = width;                 // Width in meters
    this.connectedLevelA = connectedLevelA; // Level identifier
    this.connectedLevelB = connectedLevelB; // Level identifier
    this.heightDifference = heightDifference; // Height difference in meters
    
    // Set default properties if not provided
    if (!this.getProp('width')) {
      this.setProp('width', width);
    }
    if (!this.getProp('connectedLevelA')) {
      this.setProp('connectedLevelA', connectedLevelA);
    }
    if (!this.getProp('connectedLevelB')) {
      this.setProp('connectedLevelB', connectedLevelB);
    }
    if (!this.getProp('heightDifference')) {
      this.setProp('heightDifference', heightDifference);
    }
  }

  /**
   * Get the 3D bounding box of this escalator
   * @returns {{min: [number, number, number], max: [number, number, number]}} - 3D bounding box
   */
  getBoundingBox() {
    const halfWidth = this.width / 2;
    const depth = 1.5; // Assume 1.5m depth for escalators
    const halfDepth = depth / 2;
    const bottomY = Math.min(0, this.heightDifference);
    const topY = Math.max(0, this.heightDifference);
    
    return {
      min: [
        this.position.x - halfWidth,
        bottomY,
        this.position.y - halfDepth
      ],
      max: [
        this.position.x + halfWidth,
        topY,
        this.position.y + halfDepth
      ]
    };
  }

  /**
   * Create a copy of this hall escalator
   * @returns {HallEscalator} - New hall escalator with same properties
   */
  clone() {
    return new HallEscalator(
      this.id,
      this.position.clone(),
      this.width,
      this.connectedLevelA,
      this.connectedLevelB,
      this.heightDifference,
      JSON.parse(JSON.stringify(this.properties))
    );
  }
}

/**
 * Represents a level in the hall building
 */
export class HallLevel {
  constructor(id, name, elevation = 0, properties = {}) {
    this.id = id;           // Level identifier
    this.name = name;       // Level name (e.g., "Ground Floor", "Level 1")
    this.elevation = elevation; // Elevation in meters from base
    this.properties = properties; // Level-specific properties
    this.elements = [];     // Array of HallElement objects in this level
  }

  /**
   * Add an element to this level
   * @param {HallElement} element - Element to add
   */
  addElement(element) {
    this.elements.push(element);
  }

  /**
   * Remove an element from this level
   * @param {HallElement} element - Element to remove
   * @returns {boolean} - True if element was removed
   */
  removeElement(element) {
    const index = this.elements.indexOf(element);
    if (index !== -1) {
      this.elements.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get elements by type
   * @param {string} type - Element type to filter by
   * @returns {HallElement[]} - Array of elements matching type
   */
  getElementsByType(type) {
    return this.elements.filter(element => element.type === type);
  }

  /**
   * Calculate bounding box of all elements in this level
   * @returns {{min: [number, number, number], max: [number, number, number]}} - 3D bounding box
   */
  getBoundingBox() {
    if (this.elements.length === 0) {
      return { min: [0, this.elevation, 0], max: [0, this.elevation, 0] };
    }
    
    let minX = Infinity, minY = this.elevation, minZ = Infinity;
    let maxX = -Infinity, maxY = this.elevation, maxZ = -Infinity;
    
    for (const element of this.elements) {
      const box = element.getBoundingBox ? element.getBoundingBox() : { min: [0, 0, 0], max: [0, 0, 0] };
      
      minX = Math.min(minX, box.min[0]);
      minY = Math.min(minY, box.min[1]);
      minZ = Math.min(minZ, box.min[2]);
      maxX = Math.max(maxX, box.max[0]);
      maxY = Math.max(maxY, box.max[1]);
      maxZ = Math.max(maxZ, box.max[2]);
    }
    
    return {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ]
    };
  }

  /**
   * Create a copy of this hall level
   * @returns {HallLevel} - New hall level with same properties
   */
  clone() {
    return new HallLevel(
      this.id,
      this.name,
      this.elevation,
      JSON.parse(JSON.stringify(this.properties))
    );
  }
}

/**
 * Represents the complete structural hall model
 */
export class HallModel {
  constructor() {
    this.format = 'SHADED.hall-plan.v2';
    this.unit = 'm';
    this.source = {};           // Source information (image file, etc.)
    this.calibration = {};      // Calibration information (scale, rotation, etc.)
    this.bounds = {};           // Overall bounds of the hall
    this.levels = [];           // Array of HallLevel objects
    this.globalElements = [];   // Elements that span multiple levels
    this.anchors = [];          // Structural anchors for photo matching
  }

  /**
   * Add a level to the hall
   * @param {HallLevel} level - Level to add
   */
  addLevel(level) {
    this.levels.push(level);
  }

  /**
   * Remove a level from the hall
   * @param {HallLevel} level - Level to remove
   * @returns {boolean} - True if level was removed
   */
  removeLevel(level) {
    const index = this.levels.indexOf(level);
    if (index !== -1) {
      this.levels.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get a level by ID
   * @param {string} id - Level ID
   * @returns {HallLevel|null} - Level or null if not found
   */
  getLevelById(id) {
    return this.levels.find(level => level.id === id) || null;
  }

  /**
   * Add a global element (spans multiple levels)
   * @param {HallElement} element - Element to add
   */
  addGlobalElement(element) {
    this.globalElements.push(element);
  }

  /**
   * Remove a global element
   * @param {HallElement} element - Element to remove
   * @returns {boolean} - True if element was removed
   */
  removeGlobalElement(element) {
    const index = this.globalElements.indexOf(element);
    if (index !== -1) {
      this.globalElements.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Add a structural anchor
   * @param {HallAnchor} anchor - Anchor to add
   */
  addAnchor(anchor) {
    this.anchors.push(anchor);
  }

  /**
   * Remove a structural anchor
   * @param {HallAnchor} anchor - Anchor to remove
   * @returns {boolean} - True if anchor was removed
   */
  removeAnchor(anchor) {
    const index = this.anchors.indexOf(anchor);
    if (index !== -1) {
      this.anchors.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Calculate overall bounding box of the hall
   * @returns {{min: [number, number, number], max: [number, number, number]}} - 3D bounding box
   */
  getBoundingBox() {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    // Check all levels
    for (const level of this.levels) {
      const box = level.getBoundingBox();
      minX = Math.min(minX, box.min[0]);
      minY = Math.min(minY, box.min[1]);
      minZ = Math.min(minZ, box.min[2]);
      maxX = Math.max(maxX, box.max[0]);
      maxY = Math.max(maxY, box.max[1]);
      maxZ = Math.max(maxZ, box.max[2]);
    }
    
    // Check global elements
    for (const element of this.globalElements) {
      const box = element.getBoundingBox ? element.getBoundingBox() : { min: [0, 0, 0], max: [0, 0, 0] };
      minX = Math.min(minX, box.min[0]);
      minY = Math.min(minY, box.min[1]);
      minZ = Math.min(minZ, box.min[2]);
      maxX = Math.max(maxX, box.max[0]);
      maxY = Math.max(maxY, box.max[1]);
      maxZ = Math.max(maxZ, box.max[2]);
    }
    
    // Handle empty hall
    if (minX === Infinity) {
      return { min: [0, 0, 0], max: [0, 0, 0] };
    }
    
    return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
  }

  /**
   * Get all columns in the hall
   * @returns {HallColumn[]} - Array of all column elements
   */
  getAllColumns() {
    const columns = [];
    for (const level of this.levels) {
      columns.push(...level.getElementsByType('column'));
    }
    columns.push(...this.globalElements.filter(element => element.type === 'column'));
    return columns;
  }

  /**
   * Get all walls in the hall
   * @returns {HallWall[]} - Array of all wall elements
   */
  getAllWalls() {
    const walls = [];
    for (const level of this.levels) {
      walls.push(...level.getElementsByType('wall'));
    }
    walls.push(...this.globalElements.filter(element => element.type === 'wall'));
    return walls;
  }

  /**
   * Get all cores in the hall
   * @returns {HallCore[]} - Array of all core elements
   */
  getAllCores() {
    const cores = [];
    for (const level of this.levels) {
      cores.push(...level.getElementsByType('core'));
    }
    cores.push(...this.globalElements.filter(element => element.type === 'core'));
    return cores;
  }

  /**
   * Get all portals in the hall
   * @returns {HallPortal[]} - Array of all portal elements
   */
  getAllPortals() {
    const portals = [];
    for (const level of this.levels) {
      portals.push(...level.getElementsByType('portal'));
    }
    portals.push(...this.globalElements.filter(element => element.type === 'portal'));
    return portals;
  }

  /**
   * Get all stairs in the hall
   * @returns {HallStair[]} - Array of all stair elements
   */
  getAllStairs() {
    const stairs = [];
    for (const level of this.levels) {
      stairs.push(...level.getElementsByType('stair'));
    }
    stairs.push(...this.globalElements.filter(element => element.type === 'stair'));
    return stairs;
  }

  /**
   * Get all escalators in the hall
   * @returns {HallEscalator[]} - Array of all escalator elements
   */
  getAllEscalators() {
    const escalators = [];
    for (const level of this.levels) {
      escalators.push(...level.getElementsByType('escalator'));
    }
    escalators.push(...this.globalElements.filter(element => element.type === 'escalator'));
    return escalators;
  }

  /**
   * Create a copy of this hall model
   * @returns {HallModel} - New hall model with same properties
   */
  clone() {
    return new HallModel();
  }

  /**
   * Export the hall model to a JSON-serializable object
   * @returns {Object} - Serializable hall model
   */
  exportHall() {
    return {
      format: this.format,
      unit: this.unit,
      source: JSON.parse(JSON.stringify(this.source)),
      calibration: JSON.parse(JSON.stringify(this.calibration)),
      bounds: JSON.parse(JSON.stringify(this.bounds)),
      levels: this.levels.map(level => {
        return {
          id: level.id,
          name: level.name,
          elevation: level.elevation,
          properties: JSON.parse(JSON.stringify(level.properties)),
          elements: level.elements.map(element => {
            const base = {
              id: element.id,
              type: element.type,
              properties: JSON.parse(JSON.stringify(element.properties))
            };
            
            // Add type-specific properties
            if (element instanceof HallColumn) {
              return {
                ...base,
                position: [element.position.x, element.position.y],
                footprint: [...element.footprint],
                height: element.height
              };
            } else if (element instanceof HallWall) {
              return {
                ...base,
                footprint: element.footprint.map(point => [point.x, point.y]),
                height: element.height
              };
            } else if (element instanceof HallCore) {
              return {
                ...base,
                footprint: element.footprint.map(point => [point.x, point.y]),
                height: element.height
              };
            } else if (element instanceof HallPortal) {
              return {
                ...base,
                position: [element.position.x, element.position.y],
                width: element.width,
                height: element.height
              };
            } else if (element instanceof HallStair) {
              return {
                ...base,
                position: [element.position.x, element.position.y],
                width: element.width,
                connectedLevelA: element.connectedLevelA,
                connectedLevelB: element.connectedLevelB,
                heightDifference: element.heightDifference
              };
            } else if (element instanceof HallEscalator) {
              return {
                ...base,
                position: [element.position.x, element.position.y],
                width: element.width,
                connectedLevelA: element.connectedLevelA,
                connectedLevelB: element.connectedLevelB,
                heightDifference: element.heightDifference
              };
            }
            
            return base;
          })
        };
      }),
      globalElements: this.globalElements.map(element => {
        const base = {
          id: element.id,
          type: element.type,
          properties: JSON.parse(JSON.stringify(element.properties))
        };
        
        // Add type-specific properties
        if (element instanceof HallColumn) {
          return {
            ...base,
            position: [element.position.x, element.position.y],
            footprint: [...element.footprint],
            height: element.height
          };
        } else if (element instanceof HallWall) {
          return {
            ...base,
            footprint: element.footprint.map(point => [point.x, point.y]),
            height: element.height
          };
        } else if (element instanceof HallCore) {
          return {
            ...base,
            footprint: element.footprint.map(point => [point.x, point.y]),
            height: element.height
          };
        } else if (element instanceof HallPortal) {
          return {
            ...base,
            position: [element.position.x, element.position.y],
            width: element.width,
            height: element.height
          };
        } else if (element instanceof HallStair) {
          return {
            ...base,
            position: [element.position.x, element.position.y],
            width: element.width,
            connectedLevelA: element.connectedLevelA,
            connectedLevelB: element.connectedLevelB,
            heightDifference: element.heightDifference
          };
        } else if (element instanceof HallEscalator) {
          return {
            ...base,
            position: [element.position.x, element.position.y],
            width: element.width,
            connectedLevelA: element.connectedLevelA,
            connectedLevelB: element.connectedLevelB,
            heightDifference: element.heightDifference
          };
        }
        
        return base;
      }),
      anchors: this.anchors.map(anchor => ({
        id: anchor.id,
        type: anchor.type,
        position: [anchor.position.x, anchor.position.y, anchor.position.z],
        description: anchor.description,
        confidence: anchor.confidence
      }))
    };
  }

  /**
   * Import hall model from a JSON-serializable object
   * @param {Object} data - Serialized hall model data
   */
  importHall(data) {
    this.format = data.format || 'SHADED.hall-plan.v2';
    this.unit = data.unit || 'm';
    this.source = data.source || {};
    this.calibration = data.calibration || {};
    this.bounds = data.bounds || {};
    
    // Clear existing data
    this.levels = [];
    this.globalElements = [];
    this.anchors = [];
    
    // Import levels
    if (data.levels) {
      for (const levelData of data.levels) {
        const level = new HallLevel(
          levelData.id,
          levelData.name,
          levelData.elevation,
          levelData.properties
        );
        
        // Import elements
        if (levelData.elements) {
          for (const elementData of levelData.elements) {
            let element = null;
            
            switch (elementData.type) {
              case 'column':
                element = new HallColumn(
                  elementData.id,
                  new PlanPoint(elementData.position[0], elementData.position[1]),
                  elementData.footprint,
                  elementData.height,
                  elementData.properties
                );
                break;
              case 'wall':
                element = new HallWall(
                  elementData.id,
                  elementData.footprint.map(point => new PlanPoint(point[0], point[1])),
                  elementData.height,
                  elementData.properties
                );
                break;
              case 'core':
                element = new HallCore(
                  elementData.id,
                  elementData.footprint.map(point => new PlanPoint(point[0], point[1])),
                  elementData.height,
                  elementData.properties
                );
                break;
              case 'portal':
                element = new HallPortal(
                  elementData.id,
                  new PlanPoint(elementData.position[0], elementData.position[1]),
                  elementData.width,
                  elementData.height,
                  elementData.properties
                );
                break;
              case 'stair':
                element = new HallStair(
                  elementData.id,
                  new PlanPoint(elementData.position[0], elementData.position[1]),
                  elementData.width,
                  elementData.connectedLevelA,
                  elementData.connectedLevelB,
                  elementData.heightDifference,
                  elementData.properties
                );
                break;
              case 'escalator':
                element = new HallEscalator(
                  elementData.id,
                  new PlanPoint(elementData.position[0], elementData.position[1]),
                  elementData.width,
                  elementData.connectedLevelA,
                  elementData.connectedLevelB,
                  elementData.heightDifference,
                  elementData.properties
                );
                break;
              default:
                element = new HallElement(
                  elementData.id,
                  elementData.type,
                  elementData.properties
                );
            }
            
            if (element) {
              level.addElement(element);
            }
          }
        }
        
        this.addLevel(level);
      }
    }
    
    // Import global elements
    if (data.globalElements) {
      for (const elementData of data.globalElements) {
        let element = null;
        
        switch (elementData.type) {
          case 'column':
            element = new HallColumn(
              elementData.id,
              new PlanPoint(elementData.position[0], elementData.position[1]),
              elementData.footprint,
              elementData.height,
              elementData.properties
            );
            break;
          case 'wall':
            element = new HallWall(
              elementData.id,
              elementData.footprint.map(point => new PlanPoint(point[0], point[1])),
              elementData.height,
              elementData.properties
            );
            break;
          case 'core':
            element = new HallCore(
              elementData.id,
              elementData.footprint.map(point => new PlanPoint(point[0], point[1])),
              elementData.height,
              elementData.properties
            );
            break;
          case 'portal':
            element = new HallPortal(
              elementData.id,
              new PlanPoint(elementData.position[0], elementData.position[1]),
              elementData.width,
              elementData.height,
              elementData.properties
            );
            break;
          case 'stair':
            element = new HallStair(
              elementData.id,
              new PlanPoint(elementData.position[0], elementData.position[1]),
              elementData.width,
              elementData.connectedLevelA,
              elementData.connectedLevelB,
              elementData.heightDifference,
              elementData.properties
            );
            break;
          case 'escalator':
            element = new HallEscalator(
              elementData.id,
              new PlanPoint(elementData.position[0], elementData.position[1]),
              elementData.width,
              elementData.connectedLevelA,
              elementData.connectedLevelB,
              elementData.heightDifference,
              elementData.properties
            );
            break;
          default:
            element = new HallElement(
              elementData.id,
              elementData.type,
              elementData.properties
            );
        }
        
        if (element) {
          this.addGlobalElement(element);
        }
      }
    }
    
    // Import anchors
    if (data.anchors) {
      for (const anchorData of data.anchors) {
        const anchor = new HallAnchor(
          anchorData.id,
          anchorData.type,
          new PlanPoint(anchorData.position[0], anchorData.position[1], anchorData.position[2] || 0),
          anchorData.description,
          anchorData.confidence
        );
        this.addAnchor(anchor);
      }
    }
  }
}

/**
 * Represents a structural anchor for photo matching
 */
export class HallAnchor {
  constructor(id, type, position, description = '', confidence = 1.0) {
    this.id = id;           // Anchor identifier
    this.type = type;       // Anchor type (column, wall corner, etc.)
    this.position = position; // PlanPoint3D - 3D position in world space
    this.description = description; // Human-readable description
    this.confidence = confidence; // Confidence in anchor accuracy (0-1)
  }

  /**
   * Create a copy of this hall anchor
   * @returns {HallAnchor} - New hall anchor with same properties
   */
  clone() {
    return new HallAnchor(
      this.id,
      this.type,
      this.position.clone(),
      this.description,
      this.confidence
    );
  }
}

/**
 * Represents a 3D point in hall coordinates
 */
export class PlanPoint3D {
  constructor(x, y, z) {
    this.x = x; // X coordinate in meters
    this.y = y; // Y coordinate in meters (height)
    this.z = z; // Z coordinate in meters
  }

  /**
   * Calculate distance to another point
   * @param {PlanPoint3D} other - Other point
   * @returns {number} - Distance in meters
   */
  distanceTo(other) {
    return Math.hypot(this.x - other.x, this.y - other.y, this.z - other.z);
  }

  /**
   * Create a copy of this point
   * @returns {PlanPoint3D} - New point with same coordinates
   */
  clone() {
    return new PlanPoint3D(this.x, this.y, this.z);
  }
}

/**
 * Utility functions for hall plan processing
 */
export const HallPlanUtils = {
  /**
   * Calculate meters per pixel from two known points
   * @param {PlanPoint} point1 - First point in plan coordinates (pixels)
   * @param {PlanPoint} point2 - Second point in plan coordinates (pixels)
   * @param {number} realDistance - Real distance between points in meters
   * @returns {number} - Meters per pixel
   */
  calculateMetersPerPixel(point1, point2, realDistance) {
    const pixelDistance = point1.distanceTo(point2);
    if (pixelDistance <= EPS) {
      return 0;
    }
    return realDistance / pixelDistance;
  }

  /**
   * Calculate pixels per meter from two known points
   * @param {PlanPoint} point1 - First point in plan coordinates (pixels)
   * @param {PlanPoint} point2 - Second point in plan coordinates (pixels)
   * @param {number} realDistance - Real distance between points in meters
   * @returns {number} - Pixels per meter
   */
  calculatePixelsPerMeter(point1, point2, realDistance) {
    const pixelDistance = point1.distanceTo(point2);
    if (pixelDistance <= EPS) {
      return 0;
    }
    return pixelDistance / realDistance;
  }

  /**
   * Apply scale, rotation, and offset to convert plan coordinates to world coordinates
   * @param {PlanPoint} point - Point in plan coordinates (pixels)
   * @param {number} scale - Scale factor (meters per pixel)
   * @param {number} rotation - Rotation in radians
   * @param {PlanPoint} offset - Offset in plan coordinates (pixels)
   * @returns {PlanPoint} - Point in world coordinates (meters)
   */
  applyTransform(point, scale, rotation, offset) {
    // Apply offset first
    const offsetX = point.x - offset.x;
    const offsetY = point.y - offset.y;
    
    // Apply rotation
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const rotatedX = offsetX * cos - offsetY * sin;
    const rotatedY = offsetX * sin + offsetY * cos;
    
    // Apply scale
    const worldX = rotatedX * scale;
    const worldY = rotatedY * scale;
    
    return new PlanPoint(worldX, worldY);
  }

  /**
   * Apply inverse transform to convert world coordinates to plan coordinates
   * @param {PlanPoint} point - Point in world coordinates (meters)
   * @param {number} scale - Scale factor (meters per pixel)
   * @param {number} rotation - Rotation in radians
   * @param {PlanPoint} offset - Offset in plan coordinates (pixels)
   * @returns {PlanPoint} - Point in plan coordinates (pixels)
   */
  applyInverseTransform(point, scale, rotation, offset) {
    // Apply inverse scale
    const scaledX = point.x / scale;
    const scaledY = point.y / scale;
    
    // Apply inverse rotation
    const cos = Math.cos(-rotation); // Negative rotation for inverse
    const sin = Math.sin(-rotation);
    const rotatedX = scaledX * cos - scaledY * sin;
    const rotatedY = scaledX * sin + scaledY * cos;
    
    // Apply inverse offset
    const planX = rotatedX + offset.x;
    const planY = rotatedY + offset.y;
    
    return new PlanPoint(planX, planY);
  }

  /**
   * Detect rectangles in a binary image using contour analysis
   * @param {ImageData} binaryImage - Binary image data (black/white)
   * @param {number} minArea - Minimum area threshold for detection
   * @param {number} maxAspectRatio - Maximum aspect ratio for rectangle detection
   * @returns {DetectedRectangle[]} - Array of detected rectangles
   */
  detectRectangles(binaryImage, minArea = 10, maxAspectRatio = 10) {
    // This is a simplified implementation
    // In a real implementation, this would use contour detection and approximation
    const rectangles = [];
    
    // For now, return empty array - real implementation would use OpenCV or similar
    return rectangles;
  }

  /**
   * Detect lines in a binary image using Hough transform or similar
   * @param {ImageData} binaryImage - Binary image data (black/white)
   * @param {number} minLength - Minimum length threshold for detection
   * @param {number} threshold - Detection threshold
   * @returns {DetectedLine[]} - Array of detected lines
   */
  detectLines(binaryImage, minLength = 10, threshold = 50) {
    // This is a simplified implementation
    // In a real implementation, this would use Hough transform or similar
    const lines = [];
    
    // For now, return empty array - real implementation would use OpenCV or similar
    return lines;
  }

  /**
   * Match similar elements based on geometric properties
   * @param {HallElement} template - Template element to match against
   * @param {HallElement[]} candidates - Array of candidate elements
   * @param {Object} weights - Weights for different matching criteria
   * @returns {{element: HallElement, score: number}[]} - Array of matches sorted by score
   */
  matchSimilarElements(template, candidates, weights = {}) {
    const {
      weightSize = 0.3,
      weightShape = 0.2,
      weightArea = 0.2,
      weightOrientation = 0.15,
      weightPosition = 0.15
    } = weights;
    
    const matches = [];
    
    for (const candidate of candidates) {
      // Skip if same element
      if (template.id === candidate.id) {
        continue;
      }
      
      let score = 0;
      
      // Size similarity (for columns, portals, etc.)
      if (template instanceof HallColumn && candidate instanceof HallColumn) {
        const sizeSimilarity = 1.0 - Math.abs(template.footprint[0] - candidate.footprint[0]) / 
                              Math.max(template.footprint[0], candidate.footprint[0], EPS);
        score += weightSize * sizeSimilarity;
      }
      
      // Shape similarity (basic implementation)
      if (template.type === candidate.type) {
        score += weightShape;
      }
      
      // Area similarity (for walls, cores, etc.)
      if (template instanceof HallWall && candidate instanceof HallWall) {
        const templateArea = template.length() * (template.getProp('thickness', 0.2));
        const candidateArea = candidate.length() * (candidate.getProp('thickness', 0.2));
        const areaSimilarity = 1.0 - Math.abs(templateArea - candidateArea) / 
                              Math.max(templateArea, candidateArea, EPS);
        score += weightArea * areaSimilarity;
      }
      
      // Orientation similarity (for linear elements)
      // This would be more complex in a real implementation
      
      // Position similarity (for anchors, etc.)
      // This would be more complex in a real implementation
      
      if (score > 0) {
        matches.push({ element: candidate, score });
      }
    }
    
    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);
    
    return matches;
  }
};

export {
  PlanPoint,
  PlanVector,
  PlanLine,
  PlanRectangle,
  PlanPolygon,
  DetectedLine,
  DetectedRectangle,
  HallElement,
  HallColumn,
  HallWall,
  HallCore,
  HallPortal,
  HallStair,
  HallEscalator,
  HallLevel,
  HallModel,
  HallAnchor,
  PlanPoint3D,
  HallPlanUtils
};