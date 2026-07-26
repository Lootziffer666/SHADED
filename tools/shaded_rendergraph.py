#!/usr/bin/env python3
# =====================================================================
# SHADED RENDERGRAPH · WELTGESETZ-SCHEDULER · RESSOURCEN-POOL
# Verbindliche Referenzimplementierung des Architektur-Vertrags.
# Test-Oracle für den WebGL-Renderer — deterministisch, GPU-frei.
#   §4 Rendergraph · §5 Scheduler · §6 Lastverteilung · §7 Ressourcen
#   §8 Field-Bank · §12 Verifikation · §15 Definition of Done
# =====================================================================
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable

class LawState(Enum):
    DORMANT="DORMANT"; PERSISTED="PERSISTED"; SIMULATING="SIMULATING"
    VISIBLE="VISIBLE"; FULL="FULL"
class Lifetime(Enum):
    TRANSIENT="transient"; CACHED="cached"; PERSISTENT="world-state"
class Cadence(Enum):
    FRAME="frame"; FIXEDHZ="fixedHz"; EVENT="event"; ONDIRTY="onDirty"

@dataclass
class Pass:
    id:str; phase:str; inputs:tuple; outputs:tuple
    resolution:float=1.0; cadence:Cadence=Cadence.FRAME; hz:int=60
    locality:str="fullscreen"; persistence:Lifetime=Lifetime.TRANSIENT
    priority:int=50; cost:int=1; fallback:str=None; law_id:str=None

@dataclass
class WorldLaw:
    id:str; name:str; archetype:str; fields_write:tuple; fields_read:tuple=()
    depends_on:tuple=(); cadence:Cadence=Cadence.FIXEDHZ; hz:int=30
    resolution:float=1.0; locality:str="fullscreen"
    persistence:Lifetime=Lifetime.TRANSIENT; priority:int=50; cost:int=1; fallback:str=None
    cause:Callable=lambda c:True; visible:Callable=lambda c:True; relevant:Callable=lambda c:True

@dataclass
class Context:
    sources:set=field(default_factory=set); visible_materials:set=field(default_factory=set)
    location:str="exterior"; frame_ms:float=16.6; memory_mb:float=256.0
    quality:str="high"; time:float=0.0

def has(*s): return lambda c: bool(set(s)&c.sources)
def mat(*m): return lambda c: bool(set(m)&c.visible_materials)
def exterior(c): return c.location=="exterior"
def interior(c): return c.location=="interior"
def always(c): return True

# ---- §5.2 Registry mit echtem Abhängigkeitsgraphen ----
LAWS = {
 "feuer":WorldLaw("feuer","Feuer-Nachwirkungen #36","Reaktion/Kette",
    ("AtmosField.heat","TraceField.soot","TraceField.ash"),("HydroField.wetness",),
    cadence=Cadence.FIXEDHZ,hz=30,resolution=1.0,locality="bounds",
    persistence=Lifetime.PERSISTENT,priority=90,cost=3,fallback="feuer-glow-only",
    cause=has("fire"),visible=mat("wood","vegetation","wall","dirt"),relevant=always),
 "rauch":WorldLaw("rauch","Rauchschichtung #43","Diffusion/Advektion",
    ("AtmosField.smoke",),("AtmosField.heat","wind.vector"),depends_on=("feuer",),
    cadence=Cadence.FIXEDHZ,hz=20,resolution=0.5,locality="fullscreen",
    persistence=Lifetime.TRANSIENT,priority=70,cost=2,fallback="rauch-billboard",
    cause=has("fire"),visible=always,relevant=has("fire")),
 "wasser":WorldLaw("wasser","Wasserströmung #22","Transport",
    ("HydroField.wetness","HydroField.flow","HydroField.depth"),
    cadence=Cadence.FIXEDHZ,hz=30,resolution=1.0,locality="fullscreen",
    persistence=Lifetime.CACHED,priority=80,cost=3,fallback="wasser-statisch",
    cause=has("water"),visible=mat("water","wall","dirt"),relevant=always),
 "naesse":WorldLaw("naesse","Nässe/Trocknung #42","Diffusion",
    ("HydroField.dryAge",),("HydroField.wetness",),depends_on=("wasser",),
    cadence=Cadence.FIXEDHZ,hz=5,resolution=0.5,locality="fullscreen",
    persistence=Lifetime.CACHED,priority=55,cost=1,
    cause=has("water"),visible=mat("wall","dirt","wood","skin"),relevant=mat("wall","dirt","wood","skin")),
 "schnee":WorldLaw("schnee","Schnee/Frost #2/#21","Ablagerung",
    ("StructureField.frost","HydroField.snow"),cadence=Cadence.FIXEDHZ,hz=15,resolution=1.0,
    locality="fullscreen",persistence=Lifetime.CACHED,priority=75,cost=2,fallback="schnee-decke",
    cause=has("cold"),visible=mat("snow","dirt","vegetation"),relevant=always),
 "wind":WorldLaw("wind","Wind #5","Transport",("wind.vector",),cadence=Cadence.FIXEDHZ,hz=20,
    resolution=0.25,locality="fullscreen",persistence=Lifetime.TRANSIENT,priority=60,cost=1,
    cause=has("wind"),visible=always,relevant=always),
 "fusspur":WorldLaw("fusspur","Fußspuren #2","Ablagerung/Imprint",("TraceField.print",),
    cadence=Cadence.EVENT,hz=0,resolution=1.0,locality="tiles",
    persistence=Lifetime.PERSISTENT,priority=65,cost=1,
    cause=has("movement"),visible=mat("snow","dirt","sand"),relevant=always),
 "blut":WorldLaw("blut","Blut als Information #17","Transport/Imprint",
    ("TraceField.blood",),("HydroField.wetness",),cadence=Cadence.EVENT,hz=0,resolution=1.0,
    locality="bounds",persistence=Lifetime.PERSISTENT,priority=85,cost=1,
    cause=has("damage"),visible=mat("dirt","snow","wood","skin","wall"),relevant=always),
 "rost":WorldLaw("rost","Rost #9","Alterung",("StructureField.rust",),("HydroField.wetness",),
    depends_on=("wasser","naesse"),cadence=Cadence.FIXEDHZ,hz=1,resolution=0.5,locality="bounds",
    persistence=Lifetime.PERSISTENT,priority=40,cost=1,
    cause=has("water"),visible=mat("metal"),relevant=mat("metal")),
 "mauerfeuchte":WorldLaw("mauerfeuchte","Mauerfeuchte #8","Diffusion",
    ("StructureField.damp",),("HydroField.wetness",),depends_on=("wasser","naesse"),
    cadence=Cadence.FIXEDHZ,hz=2,resolution=0.5,locality="bounds",
    persistence=Lifetime.PERSISTENT,priority=45,cost=1,
    cause=has("water"),visible=mat("wall"),relevant=mat("wall")),
 "nebel":WorldLaw("nebel","Nebel #37","Diffusion",("AtmosField.fog",),cadence=Cadence.FIXEDHZ,hz=15,
    resolution=0.5,locality="fullscreen",persistence=Lifetime.TRANSIENT,priority=50,cost=2,
    fallback="nebel-gradient",cause=has("water","cold"),visible=exterior,relevant=exterior),
 "geruch":WorldLaw("geruch","Geruch #6","Advektion",("AtmosField.odor",),("wind.vector",),
    depends_on=("blut","feuer"),cadence=Cadence.FIXEDHZ,hz=10,resolution=0.25,locality="fullscreen",
    persistence=Lifetime.TRANSIENT,priority=35,cost=1,cause=has("damage","fire"),visible=always,
    relevant=lambda c:("wind" in c.sources)or("animal" in c.sources)),
 "warmlicht":WorldLaw("warmlicht","Soziale Wärme #46","Sensor/Emission",("light.warm",),
    cadence=Cadence.FIXEDHZ,hz=10,resolution=0.5,locality="bounds",
    persistence=Lifetime.CACHED,priority=48,cost=1,
    cause=has("fire","presence"),visible=interior,relevant=interior),
 "gerstner_see":WorldLaw("gerstner_see","Offene See #22","Transport",("HydroField.surface",),
    cadence=Cadence.FRAME,hz=60,resolution=1.0,locality="fullscreen",
    persistence=Lifetime.TRANSIENT,priority=78,cost=3,fallback="gerstner-2okt",
    cause=has("water","wind"),visible=mat("water"),relevant=exterior),
}
QUALITY_SCALE={"low":0.65,"medium":0.82,"high":1.0,"auto":1.0}

class Scheduler:
    def __init__(self,laws): self.laws=laws; self.world_state={}; self.last_states={}
    def seed_state(self,lid,v): self.world_state[lid]=v
    def _base_state(self,law,ctx):
        if not law.cause(ctx):
            if law.persistence==Lifetime.PERSISTENT and self.world_state.get(law.id,0)>0:
                return LawState.PERSISTED
            return LawState.DORMANT
        vis,rel=law.visible(ctx),law.relevant(ctx)
        if vis and rel: return LawState.FULL
        if rel and not vis: return LawState.SIMULATING
        if law.persistence==Lifetime.PERSISTENT and self.world_state.get(law.id,0)>0:
            return LawState.PERSISTED
        return LawState.DORMANT
    def evaluate(self,ctx):
        states={lid:self._base_state(law,ctx) for lid,law in self.laws.items()}
        states=self._propagate_deps(states,ctx); states=self._degrade(states,ctx)
        self.last_states=states
        for lid,st in states.items():
            if st in (LawState.FULL,LawState.VISIBLE,LawState.SIMULATING):
                self.world_state[lid]=self.world_state.get(lid,0)+0.1
        return states
    def _propagate_deps(self,states,ctx):
        changed=True
        while changed:
            changed=False
            for lid,law in self.laws.items():
                if states[lid] in (LawState.FULL,LawState.VISIBLE):
                    for dep in law.depends_on:
                        if states[dep] in (LawState.DORMANT,LawState.PERSISTED) and self.laws[dep].cause(ctx):
                            states[dep]=LawState.SIMULATING; changed=True
        return states
    def _cost(self,states,ctx):
        q=QUALITY_SCALE.get(ctx.quality,1.0); total=0.0
        for lid,st in states.items():
            law=self.laws[lid]
            cadence_weight=(min(1.0,max(1,law.hz)/60.0) if law.cadence==Cadence.FIXEDHZ
                else 0.1 if law.cadence in (Cadence.EVENT,Cadence.ONDIRTY) else 1.0)
            scale=max(0.125,min(1.0,law.resolution*q))
            if st==LawState.VISIBLE: scale*=0.5 if law.fallback else 0.75
            if st in (LawState.FULL,LawState.VISIBLE): total+=law.cost*(scale**2)*cadence_weight
            elif st==LawState.SIMULATING: total+=law.cost*0.05
        return total
    def _degrade(self,states,ctx):
        budget=ctx.frame_ms/16.6*12.0; order=sorted(states,key=lambda l:self.laws[l].priority); guard=0
        while self._cost(states,ctx)>budget and guard<100:
            guard+=1; degraded=False
            for lid in order:
                st=states[lid]; law=self.laws[lid]
                if st==LawState.FULL: states[lid]=LawState.VISIBLE; degraded=True; break
                if st==LawState.VISIBLE and law.fallback: states[lid]=LawState.SIMULATING; degraded=True; break
            if not degraded: break
        return states

@dataclass
class Resource:
    rid:str; lifetime:Lifetime; size_mb:float; slot:int=None; born:int=0; dead:int=0; pingpong:bool=False

class ResourcePool:
    def __init__(self): self.resources={}; self._slot_counter=0; self.leaks=[]
    def alloc(self,rid,lt,size,born,dead,pingpong=False):
        r=Resource(rid,lt,size,born=born,dead=dead,pingpong=pingpong); self.resources[rid]=r; return r
    def assign_slots(self):
        ordered=sorted(self.resources.values(),key=lambda r:(r.born,r.rid)); slot_free_at={}
        for r in ordered:
            placed=False
            for sid,free_at in slot_free_at.items():
                if r.born>=free_at: r.slot=sid; slot_free_at[sid]=max(free_at,r.dead); placed=True; break
            if not placed:
                sid=self._slot_counter; self._slot_counter+=1; r.slot=sid; slot_free_at[sid]=r.dead
        return self._slot_counter
    def check_leaks(self,frame_end):
        self.leaks=[r.rid for r in self.resources.values() if r.lifetime==Lifetime.TRANSIENT and r.dead>frame_end]
        return self.leaks
    def alias_groups(self):
        g={}
        for r in self.resources.values(): g.setdefault(r.slot,[]).append(r.rid)
        return {s:ids for s,ids in g.items() if len(ids)>1}

class RenderGraphCompiler:
    def __init__(self,laws): self.laws=laws
    def _phase(self,arch):
        if any(k in arch for k in("Transport","Diffusion","Advektion")): return "simulation"
        if any(k in arch for k in("Reaktion","Alterung","Ablagerung")): return "material"
        if any(k in arch for k in("Sensor","Emission")): return "lighting"
        return "composite"
    def build_passes(self,states,ctx):
        passes=[]
        for lid,st in states.items():
            law=self.laws[lid]
            if st in (LawState.FULL,LawState.VISIBLE):
                res=law.resolution
                if st==LawState.VISIBLE and law.fallback: res=min(res,0.5)
                passes.append(Pass(f"{lid}.pass",self._phase(law.archetype),law.fields_read,law.fields_write,
                    resolution=res,cadence=law.cadence,hz=law.hz,locality=law.locality,
                    persistence=law.persistence,priority=law.priority,cost=law.cost,
                    fallback=law.fallback,law_id=lid))
        return passes
    def topo_sort(self,passes):
        produces={}; by_id={}
        for p in passes:
            if p.id in by_id: raise ValueError(f"Doppelte Pass-ID: {p.id}")
            by_id[p.id]=p
            for o in p.outputs:
                if o in produces: raise ValueError(f"Mehrere Producer für {o}: {produces[o]} und {p.id}")
                produces[o]=p.id
        order,visited,temp,stack=[],set(),set(),[]
        def visit(p):
            if p.id in visited: return
            if p.id in temp:
                start=stack.index(p.id) if p.id in stack else 0
                raise ValueError("Rendergraph-Zyklus: "+" → ".join(stack[start:]+[p.id]))
            temp.add(p.id); stack.append(p.id)
            for i in p.inputs:
                if i in produces and produces[i]!=p.id: visit(by_id[produces[i]])
            stack.pop(); temp.discard(p.id); visited.add(p.id); order.append(p.id)
        for p in sorted(passes,key=lambda x:-x.priority): visit(p)
        return order
    def fusion_candidates(self,passes):
        g={}
        for p in passes: g.setdefault((p.phase,p.resolution,p.hz,p.locality),[]).append(p.id)
        return {k:v for k,v in g.items() if len(v)>1}
    def active_this_frame(self,passes,frame,fps=60):
        active=[]
        for p in passes:
            if p.cadence==Cadence.FRAME: active.append(p.id)
            elif p.cadence==Cadence.FIXEDHZ:
                if frame%max(1,round(fps/max(1,p.hz)))==0: active.append(p.id)
            elif p.cadence==Cadence.EVENT: active.append(p.id+" [event]")
            elif p.cadence==Cadence.ONDIRTY: active.append(p.id+" [onDirty]")
        return active

# =====================================================================
# TEST-SUITE — §12 Fixtures + §15 Definition of Done
# =====================================================================
def run_tests():
    comp=RenderGraphCompiler(LAWS); P,F="  ✅","  ❌"; results=[]
    def check(name,cond,detail=""): results.append((cond,name,detail))
    HIGH=dict(frame_ms=200.0)

    s1=Scheduler(LAWS)
    st=s1.evaluate(Context(sources={"fire","cold","wind","water","movement","damage"},
        visible_materials={"snow","dirt","wood","metal","water","vegetation"},location="exterior",quality="high",**HIGH))
    check("F1 Feuer FULL",st["feuer"]==LawState.FULL,st["feuer"].value)
    check("F1 Schnee FULL",st["schnee"]==LawState.FULL,st["schnee"].value)
    check("F1 Blut FULL",st["blut"]==LawState.FULL,st["blut"].value)
    check("F1 Rauch via Abhängigkeit",st["rauch"] in (LawState.FULL,LawState.VISIBLE,LawState.SIMULATING),st["rauch"].value)
    check("F1 Mauerfeuchte DORMANT",st["mauerfeuchte"]==LawState.DORMANT,st["mauerfeuchte"].value)
    check("F1 Warmlicht DORMANT (exterior)",st["warmlicht"]==LawState.DORMANT,st["warmlicht"].value)
    check("F1 Offene See FULL",st["gerstner_see"]==LawState.FULL,st["gerstner_see"].value)

    s2=Scheduler(LAWS)
    st2=s2.evaluate(Context(sources={"fire","water","presence"},visible_materials={"wall","metal","wood"},
        location="interior",quality="high",**HIGH))
    check("F2 Mauerfeuchte aktiv",st2["mauerfeuchte"] in (LawState.FULL,LawState.VISIBLE),st2["mauerfeuchte"].value)
    check("F2 Warmlicht FULL",st2["warmlicht"]==LawState.FULL,st2["warmlicht"].value)
    check("F2 Nebel DORMANT (innen)",st2["nebel"]==LawState.DORMANT,st2["nebel"].value)
    check("F2 Offene See DORMANT (innen)",st2["gerstner_see"]==LawState.DORMANT,st2["gerstner_see"].value)
    check("F2 Rost aktiv",st2["rost"] in (LawState.FULL,LawState.VISIBLE),st2["rost"].value)

    s3=Scheduler(LAWS)
    stA=s3.evaluate(Context(sources={"movement","damage","water"},visible_materials={"snow","dirt","metal"},location="exterior",**HIGH))
    stB=s3.evaluate(Context(sources={"presence"},visible_materials={"wall","wood"},location="interior",**HIGH))
    check("F3 Fußspur außen FULL",stA["fusspur"]==LawState.FULL,stA["fusspur"].value)
    check("F3 Fußspur innen PERSISTED",stB["fusspur"]==LawState.PERSISTED,stB["fusspur"].value)
    check("F3 Blut innen PERSISTED",stB["blut"]==LawState.PERSISTED,stB["blut"].value)
    check("F3 Weltzustand überlebt",s3.world_state.get("fusspur",0)>0,f"{s3.world_state.get('fusspur',0):.2f}")
    check("F3 PERSISTED → kein Pass","fusspur.pass" not in [p.id for p in comp.build_passes(stB,Context())],"kein Pass")

    s4=Scheduler(LAWS)
    rich=Context(sources={"fire","cold","wind","water","movement","damage"},
        visible_materials={"snow","dirt","wood","metal","water","vegetation"},location="exterior",frame_ms=200.0,quality="high")
    st_rich=s4.evaluate(rich); n_rich=sum(1 for x in st_rich.values() if x==LawState.FULL); before=dict(s4.world_state)
    poor=Context(sources={"fire","cold","wind","water","movement","damage"},
        visible_materials={"snow","dirt","wood","metal","water","vegetation"},location="exterior",frame_ms=2.0,quality="high")
    st_poor=s4.evaluate(poor); n_poor=sum(1 for x in st_poor.values() if x==LawState.FULL)
    check("F4 reich → viele FULL",n_rich>=5,f"{n_rich} FULL")
    check("F4 knapp → degradiert",n_poor<n_rich,f"{n_rich}→{n_poor} FULL")
    lost=[k for k,v in before.items() if v>0 and s4.world_state.get(k,0)==0]
    check("F4 KEIN Weltzustand gelöscht (§6.5)",len(lost)==0,f"verloren={lost}")

    sc=Scheduler(LAWS)
    ctx=Context(sources={"fire","cold","wind","water","movement","damage"},
        visible_materials={"snow","dirt","wood","metal","water","vegetation"},location="exterior",frame_ms=200.0,quality="high")
    states=sc.evaluate(ctx); passes=comp.build_passes(states,ctx)
    pass_laws={p.law_id for p in passes}; inact=[l for l,s in states.items() if s in (LawState.DORMANT,LawState.PERSISTED)]
    check("DoD Inaktive → keine Pässe (§13)",not (set(inact)&pass_laws),f"{len(inact)} inaktiv→0 Pässe")
    freqs={p.hz for p in passes if p.cadence==Cadence.FIXEDHZ}
    check("DoD ≥2 Frequenzen parallel (§6.1)",len(freqs)>=2,f"{sorted(freqs)} Hz")
    red=[p for p in passes if p.resolution<1.0]
    check("DoD ≥1 Pass reduziert (§6.2)",len(red)>=1,", ".join(f"{p.law_id}@{p.resolution}" for p in red))
    f0=comp.active_this_frame(passes,0); f1=comp.active_this_frame(passes,1)
    check("DoD Frequenz-Steuerung",len(f0)!=len(f1),f"{len(f0)} vs {len(f1)} Pässe")
    pool=ResourcePool()
    pool.alloc("feuer.rt",Lifetime.TRANSIENT,8,0,1); pool.alloc("rauch.rt",Lifetime.TRANSIENT,4,0,1)
    pool.alloc("wasser.field",Lifetime.CACHED,16,0,10); pool.alloc("fusspur.field",Lifetime.PERSISTENT,12,0,999)
    pool.alloc("nebel.rt",Lifetime.TRANSIENT,4,1,2); pool.alloc("atmos.tmp",Lifetime.TRANSIENT,8,1,2)
    nslot=pool.assign_slots(); leaks=pool.check_leaks(2)
    check("DoD Aliasing (§7.2)",nslot<len(pool.resources),f"{len(pool.resources)}→{nslot} Slots")
    check("DoD keine Leaks (§12)",len(leaks)==0,f"leaks={leaks}")
    sA=Scheduler(LAWS); sB=Scheduler(LAWS)
    cA=Context(sources={"fire","water","cold"},visible_materials={"wall","metal"},location="interior",frame_ms=200.0)
    cB=Context(sources={"fire","water","cold"},visible_materials={"wall","metal"},location="interior",frame_ms=200.0)
    check("DoD deterministisch (§12)",sA.evaluate(cA)==sB.evaluate(cB),"identisch")
    check("DoD Topologie",len(comp.topo_sort(passes))==len(passes),f"{len(passes)} sortiert")
    cyc_a=Pass("cyc-a","simulation",("cyc-z",),("cyc-y",))
    cyc_b=Pass("cyc-b","simulation",("cyc-y",),("cyc-z",))
    try:
        comp.topo_sort([cyc_a,cyc_b]); cycle_rejected=False
    except ValueError:
        cycle_rejected=True
    check("DoD Zyklen werden abgewiesen",cycle_rejected,"ValueError")
    dup_a=Pass("dup-a","simulation",(),("dup",))
    dup_b=Pass("dup-b","simulation",(),("dup",))
    try:
        comp.topo_sort([dup_a,dup_b]); duplicate_rejected=False
    except ValueError:
        duplicate_rejected=True
    check("DoD Mehrfach-Producer werden abgewiesen",duplicate_rejected,"ValueError")
    pa=Pass("a","simulation",("x",),("y",),resolution=0.5,cadence=Cadence.FIXEDHZ,hz=5,locality="fullscreen")
    pb=Pass("b","simulation",("x",),("z",),resolution=0.5,cadence=Cadence.FIXEDHZ,hz=5,locality="fullscreen")
    pc=Pass("c","simulation",("x",),("w",),resolution=0.5,cadence=Cadence.FIXEDHZ,hz=20,locality="fullscreen")
    fus=comp.fusion_candidates([pa,pb,pc])
    check("DoD Fusion-Mechanismus (§4.3)",any("a" in v and "b" in v for v in fus.values()) and not any("c" in v for v in fus.values()),"kompatibel fusioniert, 20Hz getrennt")

    print("="*70); print("SHADED RENDERGRAPH — VERIFIKATIONS-REPORT"); print("="*70)
    for cond,name,detail in results: print((P if cond else F),name,f"  [{detail}]" if detail else "")
    ok=sum(1 for c,_,_ in results if c)
    print("="*70); print(f"GESAMT: {ok}/{len(results)} bestanden")
    print(f"Degradation {n_rich}→{n_poor} FULL · Weltzustand 0 verloren · Frequenzen {sorted(freqs)} Hz · Aliasing {nslot} Slots")
    return ok==len(results)

if __name__=="__main__":
    import sys; sys.exit(0 if run_tests() else 1)
