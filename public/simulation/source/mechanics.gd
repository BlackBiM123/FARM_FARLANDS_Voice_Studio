extends RefCounted
## Declarative mechanics v1. No eval, scripts or resource minting in data.
static func modules(world: Dictionary) -> Array:
	return world.get("mechanics",{}).get("modules",[]).filter(func(m):return m.get("enabled",false))

static func definition_error(world: Dictionary) -> String:
	var registry=world.get("mechanics",{"version":1,"modules":[]})
	if not registry is Dictionary or int(registry.get("version",0))!=1 or not registry.get("modules") is Array: return "Неизвестный формат механик"
	if registry.modules.size()>16: return "Слишком много модулей"
	var ids: Dictionary={}
	var names: Array=["Отдых","Поесть","Купить дом","Работа","Перевозка","Общение","Свободное время","Пополнить запас еды"]
	var variable_count:=0
	var action_count:=0
	for module in registry.modules:
		if not module is Dictionary or not module.has_all(["id","name","version","enabled","variables","actions"]): return "Неполный модуль"
		if int(module.version)!=1: return "Неизвестная версия модуля: "+str(module.id)
		if ids.has(module.id) or module.id in ["core_needs","core_cooking"]: return "Повтор или зарезервированный ID модуля"
		ids[module.id]=true
		if not module.variables is Array or not module.actions is Array: return "Нужны списки показателей и действий"
		var variables: Dictionary={}
		for variable in module.variables:
			if not variable is Dictionary or not variable.has_all(["id","name","scope","unit","min","max","initial","perMinute"]): return "Неполный показатель"
			if variables.has(variable.id) or not variable.scope in ["npc","world"]: return "Повтор показателя или неизвестная область"
			for field in ["min","max","initial","perMinute"]:
				if not (variable[field] is int or variable[field] is float) or float(variable[field])!=floor(float(variable[field])) or absf(float(variable[field]))>1000000: return "Показатели должны быть ограниченными целыми числами"
			if int(variable.min)>=int(variable.max) or int(variable.initial)<int(variable.min) or int(variable.initial)>int(variable.max) or abs(int(variable.perMinute))>1000: return "Некорректный диапазон показателя"
			variables[variable.id]=variable
			variable_count+=1
		var actions: Dictionary={}
		for action in module.actions:
			if not action is Dictionary or not action.has_all(["id","name","variable","when","threshold","priority","minutes","delta","place"]): return "Неполное действие"
			if actions.has(action.id) or names.has(action.name) or not variables.has(action.variable): return "Повтор действия или неизвестный показатель"
			if not action.when in ["below","above"] or not action.place in ["current","home","work"]: return "Неизвестное условие или место действия"
			for field in ["threshold","priority","minutes","delta"]:
				if not (action[field] is int or action[field] is float) or float(action[field])!=floor(float(action[field])) or absf(float(action[field]))>1000000: return "Неверный числовой параметр действия"
			var variable: Dictionary=variables[action.variable]
			if int(action.threshold)<int(variable.min) or int(action.threshold)>int(variable.max) or int(action.minutes)<1 or int(action.minutes)>1440 or int(action.priority)<1 or int(action.priority)>200: return "Параметры действия вне диапазона"
			actions[action.id]=true
			names.append(action.name)
			action_count+=1
	if variable_count>64 or action_count>16: return "Лимит: 64 показателя и 16 действий"
	return ""

static func builtins(world: Dictionary) -> Array:
	var n: Dictionary=world.get("needs",{})
	return [{"id":"core_needs:fullness","field":"hunger","min":0,"max":1000,"initial":int(n.get("initialFullness",900)),"drift":-int(n.get("fullnessDrain",1))},{"id":"core_needs:energy","field":"energy","min":0,"max":1000,"initial":int(n.get("initialEnergy",900)),"drain":int(n.get("energyDrain",1)),"rest":int(n.get("restGain",5))}]

static func versions(world: Dictionary) -> Dictionary:
	var result: Dictionary={"core_needs":1}
	if world.get("cooking",{}).get("enabled",false): result.core_cooking=1
	for module in modules(world): result[module.id]=int(module.version)
	return result

static func initialize(world: Dictionary, state: Dictionary, fresh: bool) -> void:
	if fresh or not state.has("mechanics"):
		state.mechanics={"version":1,"versions":versions(world),"values":{},"recent":[]}
		for module in modules(world):
			for variable in module.variables:
				var values: Dictionary={}
				for owner in (["world"] if variable.scope=="world" else state.agents.keys()): values[owner]=int(variable.initial)
				state.mechanics.values[module.id+":"+variable.id]=values
	if fresh:
		for actor in state.agents.values():
			for variable in builtins(world): actor[variable.field]=int(variable.initial)

static func validate(world: Dictionary, state: Dictionary) -> String:
	var expected:=versions(world)
	if not state.has("mechanics"):
		return "В снимке нет состояния включённых механик" if not modules(world).is_empty() else ""
	var saved: Dictionary=state.mechanics
	if int(saved.get("version",0))!=1 or not saved.get("versions") is Dictionary or not saved.get("values") is Dictionary: return "Неизвестный формат состояния механик"
	if saved.versions.size()!=expected.size(): return "Версии механик не совпадают"
	for id in expected:
		if int(saved.versions.get(id,0))!=int(expected[id]): return "Версия механики не поддерживается: "+id
	var count:=0
	for module in modules(world):
		if int(module.version)!=1: return "Неизвестная версия модуля: "+str(module.id)
		for variable in module.variables:
			count+=1
			var id: String=module.id+":"+variable.id
			var owners: Array=["world"] if variable.scope=="world" else state.agents.keys()
			var values: Dictionary=saved.values.get(id,{})
			if values.size()!=owners.size(): return "Неполный показатель: "+id
			for owner in owners:
				if not values.has(owner) or not (values[owner] is int or values[owner] is float): return "Нет значения: "+id
				var value: float=float(values[owner])
				if value!=floor(value) or value<float(variable.min) or value>float(variable.max): return "Показатель вне диапазона: "+id
	if saved.values.size()!=count: return "В снимке есть неизвестные показатели"
	for actor in state.agents.values():
		var action: Dictionary=actor.action.get("after",{}) if actor.action.get("type","")=="travel" else actor.action
		if action.get("type","")=="mechanic":
			var spec:=find_action(world,str(action.get("module","")),str(action.get("mechanicAction","")))
			if spec.is_empty() or int(action.get("remaining",0))<1 or int(action.get("remaining",0))>int(spec.minutes): return "Неизвестное действие механики"
	return ""

static func remember(rows: Array, minute: int, variable: String, rule: String, before: int, after: int) -> void:
	rows.append({"minute":minute,"variable":variable,"rule":rule,"before":before,"after":after,"delta":after-before})
	if rows.size()>12: rows.pop_front()

static func binding_effect(world: Dictionary, state: Dictionary, actor: Dictionary, variable_id: String, delta: int, rule: String) -> void:
	for variable in builtins(world):
		if variable.id!=variable_id: continue
		apply_binding(state,actor,variable,delta,rule)

static func apply_binding(state: Dictionary, actor: Dictionary, variable: Dictionary, delta: int, rule: String) -> void:
	var before:=int(actor[variable.field])
	var after:=clampi(before+delta,int(variable.min),int(variable.max))
	actor[variable.field]=after
	if before!=after:
		if not actor.has("mechanicTrace"): actor.mechanicTrace=[]
		remember(actor.mechanicTrace,int(state.minute),str(variable.id),rule,before,after)

static func change(state: Dictionary, module: Dictionary, variable: Dictionary, owner: String, delta: int, rule: String) -> void:
	var id: String=module.id+":"+variable.id
	var before:=int(state.mechanics.values[id][owner])
	var after:=clampi(before+delta,int(variable.min),int(variable.max))
	state.mechanics.values[id][owner]=after
	if before==after: return
	var rows: Array=state.mechanics.recent
	if variable.scope=="npc":
		var actor: Dictionary=state.agents[owner]
		if not actor.has("mechanicTrace"): actor.mechanicTrace=[]
		rows=actor.mechanicTrace
	remember(rows,int(state.minute),id,rule,before,after)

static func tick_world(_world: Dictionary, state: Dictionary, active: Array) -> void:
	for module in active:
		for variable in module.variables:
			if variable.scope=="world": change(state,module,variable,"world",int(variable.perMinute),"drift")

static func tick_actor(_world: Dictionary, state: Dictionary, npc: Dictionary, actor: Dictionary, specs: Array, active: Array) -> void:
	for variable in specs:
		var delta:=int(variable.get("drift",0))
		var rule: String="metabolism"
		if variable.field=="energy":
			delta=0 if actor.action.is_empty() else (int(variable.rest) if actor.action.type=="rest" else -int(variable.drain))
			rule="rest" if actor.action.get("type","")=="rest" else "activity"
		apply_binding(state,actor,variable,delta,rule)
	for module in active:
		for variable in module.variables:
			if variable.scope=="npc": change(state,module,variable,str(npc.id),int(variable.perMinute),"drift")

static func need_scores(world: Dictionary, actor: Dictionary, clock: int) -> Dictionary:
	var n: Dictionary=world.get("needs",{})
	return {"rest":int(n.get("nightPriority",100)) if clock<360 or clock>=1320 else (int(n.get("restPriority",130)) if int(actor.energy)<int(n.get("restThreshold",150)) else -1),"eat":int(n.get("eatPriority",120)) if int(actor.hunger)<int(n.get("eatThreshold",300)) else -1}

static func choices(_world: Dictionary, state: Dictionary, npc: Dictionary, actor: Dictionary, active: Array) -> Array:
	var result: Array=[]
	for module in active:
		for action in module.actions:
			var variable: Dictionary=module.variables.filter(func(v):return v.id==action.variable)[0]
			var owner: String="world" if variable.scope=="world" else str(npc.id)
			var value:=int(state.mechanics.values[module.id+":"+variable.id][owner])
			var eligible: bool=value<int(action.threshold) if action.when=="below" else value>int(action.threshold)
			result.append({"action":action.name,"score":int(action.priority) if eligible else -1,"reason":str(variable.name)+": "+str(value)+" "+str(variable.unit)+"; порог "+str(int(action.threshold))+" ("+("ниже" if action.when=="below" else "выше")+"). "+("Условие выполнено" if eligible else "Условие не выполнено"),"_module":module.id,"_action":action.id,"_place":actor.place if action.place=="current" else (actor.home if action.place=="home" else npc.work),"_minutes":int(action.minutes)})
	return result

static func find_action(world: Dictionary, module_id: String, action_id: String) -> Dictionary:
	for module in modules(world):
		if module.id==module_id:
			for action in module.actions:
				if action.id==action_id: return action
	return {}

static func finish(world: Dictionary, state: Dictionary, npc: Dictionary, action: Dictionary) -> Dictionary:
	for module in modules(world):
		if module.id!=action.module: continue
		var spec:=find_action(world,module.id,str(action.mechanicAction))
		if spec.is_empty(): return {}
		var variable: Dictionary=module.variables.filter(func(v):return v.id==spec.variable)[0]
		change(state,module,variable,"world" if variable.scope=="world" else str(npc.id),int(spec.delta),str(spec.name))
		return {"module":module.id,"action":spec.id,"variable":module.id+":"+variable.id,"delta":int(spec.delta)}
	return {}

static func on_work(core, npc: Dictionary, actor: Dictionary) -> void:
	# Trusted adapters retain real inventory, payment and labour services.
	if npc.role=="farmer": core._produce(npc)
	if npc.role=="innkeeper": core._cook(npc,actor)
