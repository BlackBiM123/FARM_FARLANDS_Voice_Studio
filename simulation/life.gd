extends RefCounted
## Жизненные последствия v1. Денег и товаров не создаёт, авторский лор не меняет.
static func enabled(world: Dictionary) -> bool:
	return world.get("life",{}).get("enabled",false)

static func definition_error(world: Dictionary) -> String:
	if not world.has("life"): return ""
	var config=world.life
	if not config is Dictionary or not config.has_all(["version","enabled","socialDelta","initialRelations","requests"]) or int(config.version)!=1 or not config.enabled is bool: return "Неверное определение жизненного слоя"
	if not config.socialDelta is Dictionary or not config.initialRelations is Array or not config.requests is Array or config.requests.size()>64 or config.initialRelations.size()>1000: return "Неполное определение жизненного слоя"
	for field in ["affinity","trust","respect","attachment"]:
		var n=config.socialDelta.get(field)
		if not (n is int or n is float) or float(n)!=floor(float(n)) or absf(float(n))>100: return "Неверный эффект отношений"
	var actors: Array=world.agents.map(func(a):return a.id)
	var pairs:Dictionary={}
	for rel in config.initialRelations:
		if not rel is Dictionary or not rel.has_all(["from","to","scores"]) or not rel.scores is Dictionary: return "Неполная связь"
		var key=str(rel.from)+":"+str(rel.to)
		if rel.from==rel.to or not rel.from in actors or not rel.to in actors or pairs.has(key): return "Неизвестная или повторная связь"
		pairs[key]=true
		for field in ["affinity","trust","respect","attachment"]:
			var n=rel.scores.get(field)
			if not (n is int or n is float) or float(n)!=floor(float(n)) or absf(float(n))>100: return "Неверные начальные отношения"
	var ids:Dictionary={}
	for rule in config.requests:
		if not rule is Dictionary or not rule.has_all(["id","name","issuer","actor","target","deadlineMinutes","priority"]): return "Неполная просьба"
		if ids.has(rule.id) or not rule.issuer in actors or not rule.actor in actors or not rule.target in actors or rule.issuer==rule.actor or rule.actor==rule.target or rule.target==rule.issuer: return "Неверные стороны просьбы"
		ids[rule.id]=true
		for key in ["deadlineMinutes","priority"]:
			var n=rule[key]
			if not (n is int or n is float) or float(n)!=floor(float(n)) or int(n)<1 or int(n)>(119 if key=="priority" else 43200): return "Неверные сроки или приоритет просьбы"
	return ""

static func initialize(world: Dictionary,state: Dictionary) -> void:
	if not enabled(world) or state.has("life"): return
	state.life={"version":1,"processedThrough":int(state.nextEvent)-1,"relations":{},"goals":{},"quests":{},"traces":{}}
	for npc in world.agents:
		state.life.goals[npc.id]={}
		state.life.traces[npc.id]=[]
		state.life.relations[npc.id]={}
		for other in state.agents[npc.id].relationships:
			state.life.relations[npc.id][other]={"affinity":int(state.agents[npc.id].relationships[other]),"trust":0,"respect":0,"attachment":0,"cause":""}
		if npc.goalHouse:
			state.life.goals[npc.id].housing={"kind":"housing","status":"completed" if state.agents[npc.id].ownsHouse else "active","updated":int(state.minute),"cause":""}
		var outstanding:=0
		for debt in state.get("obligations",[]):
			if debt.from==npc.account: outstanding+=int(debt.remaining)
		if outstanding>0: state.life.goals[npc.id].debt={"kind":"debt","status":"active","amount":outstanding,"updated":int(state.minute),"cause":""}
	for rel in world.life.initialRelations:
		# Начальные значения только при старте; миграция не переписывает накопленную симпатию.
		if not state.life.relations[rel.from].has(rel.to):
			var scores: Dictionary=rel.scores.duplicate(true)
			scores.cause=""
			state.life.relations[rel.from][rel.to]=scores
			state.agents[rel.from].relationships[rel.to]=int(scores.affinity)

static func validate(world: Dictionary,state: Dictionary,legacy: bool) -> String:
	if not enabled(world): return "Отключён жизненный слой, но в снимке есть его состояние" if state.has("life") else ""
	if not state.has("life"): return "" if legacy else "Пропало состояние жизненного слоя"
	var life=state.life
	if not life is Dictionary or int(life.get("version",0))!=1: return "Неизвестная версия жизненного слоя"
	if not (life.get("processedThrough") is int or life.get("processedThrough") is float) or float(life.processedThrough)!=float(state.nextEvent)-1: return "Нарушен причинный курсор жизненного слоя"
	for field in ["relations","goals","quests","traces"]:
		if not life.get(field) is Dictionary: return "Неполный жизненный слой"
	for field in ["relations","goals","traces"]:
		if life[field].size()!=state.agents.size(): return "Разный состав жизненного слоя"
	for actor in state.agents:
		if not life.relations.has(actor) or not life.goals.has(actor) or not life.traces.has(actor): return "Нет жизненного состояния NPC"
		if not life.relations[actor] is Dictionary or not life.goals[actor] is Dictionary: return "Неверный формат отношений или целей"
		if not life.traces[actor] is Array or life.traces[actor].size()>12: return "Неверная история жизненных изменений"
		for other in life.relations[actor]:
			if not state.agents.has(other) or other==actor: return "Неизвестная сторона отношения"
			var rel=life.relations[actor][other]
			if not rel is Dictionary or not valid_cause(rel.get("cause"),state): return "Неверная причина отношения"
			for key in ["affinity","trust","respect","attachment"]:
				if not rel.get(key) is float and not rel.get(key) is int: return "Нет показателя отношений"
				if float(rel[key])!=floor(float(rel[key])) or int(rel[key]) < -100 or int(rel[key])>100: return "Отношения вне диапазона"
			if int(state.agents[actor].relationships.get(other,0))!=int(rel.affinity): return "Разные значения совместимой симпатии"
		for key in life.goals[actor]:
			var g=life.goals[actor][key]
			if not g is Dictionary or not g.has_all(["kind","status","updated","cause"]) or not key in ["housing","debt"] or g.kind!=key or not g.status in ["active","completed"] or not valid_cause(g.cause,state) or not valid_minute(g.updated,state): return "Неверная жизненная цель"
			if key=="housing" and (g.status=="completed")!=bool(state.agents[actor].ownsHouse): return "Цель жилья расходится с собственностью"
			if key=="debt":
				var npc=world.agents.filter(func(n):return n.id==actor)[0]
				var amount:=0
				for debt in state.get("obligations",[]):
					if debt.from==npc.account: amount+=int(debt.remaining)
				if int(g.get("amount",-1))!=amount or (g.status=="completed")!=(amount==0): return "Цель долга расходится с обязательствами"
		for record in life.traces[actor]:
			if not record is Dictionary or not record.has_all(["kind","minute","cause"]) or not record.kind in ["money","move"] or not valid_cause(record.cause,state) or not valid_minute(record.minute,state): return "Неверный жизненный след"
			if record.kind=="money" and not (record.get("delta") is int or record.get("delta") is float): return "Нет суммы денежного изменения"
			if record.kind=="move" and (not record.get("from") is String or not record.get("to") is String): return "Нет мест переезда"
	for key in life.quests:
		var q=life.quests[key]
		var rules=world.life.requests.filter(func(r):return r.id==key)
		if rules.size()!=1 or not q is Dictionary: return "Неизвестная просьба в снимке"
		var rule=rules[0]
		if not q.get("status","") in ["active","completed","expired"] or not q.has_all(["created","deadline","updated","cause","issuer","actor","target"]): return "Неполная просьба"
		if q.actor!=rule.actor or q.issuer!=rule.issuer or q.target!=rule.target or int(q.created)>int(q.updated) or int(q.updated)>int(state.minute) or int(q.deadline)!=int(q.created)+int(rule.deadlineMinutes): return "Неверные стороны или сроки просьбы"
		if not valid_cause(q.cause,state) or not valid_minute(q.created,state) or not valid_minute(q.updated,state) or (q.status=="active" and int(q.deadline)<=int(state.minute)) or (q.status=="completed" and int(q.updated)>=int(q.deadline)) or (q.status=="expired" and int(q.updated)<int(q.deadline)): return "Неверное причинное состояние просьбы"
	return ""

static func valid_minute(value,state: Dictionary) -> bool:
	return (value is int or value is float) and float(value)==floor(float(value)) and int(value)>=360 and int(value)<=int(state.minute)

static func valid_cause(value,state: Dictionary) -> bool:
	if not value is String: return false
	if value=="": return true
	var n:=int(value.trim_prefix("event_"))
	return value=="event_"+str(n) and n>0 and n<int(state.nextEvent)

static func trace(state: Dictionary,actor: String,record: Dictionary) -> void:
	state.life.traces[actor].append(record)
	if state.life.traces[actor].size()>12: state.life.traces[actor].pop_front()

static func consume(world: Dictionary,state: Dictionary,event: Dictionary) -> Array:
	if not enabled(world): return []
	var serial:=int(str(event.id).trim_prefix("event_"))
	if serial<=int(state.life.processedThrough): return []
	state.life.processedThrough=serial
	var effects:Array=[]
	if event.type=="life" and event.data.get("status","")=="expired" and state.life.quests.has(event.data.get("request","")):
		state.life.quests[event.data.request].cause=event.id
	if event.type=="social":
		var pair:Array=[event.actor,str(event.data.get("other",""))]
		if pair[0]!=pair[1] and state.agents.has(pair[0]) and state.agents.has(pair[1]):
			for i in 2:
				var actor: String=pair[i]
				var other: String=pair[1-i]
				var rel: Dictionary=state.life.relations[actor].get(other,{"affinity":int(state.agents[actor].relationships.get(other,0)),"trust":0,"respect":0,"attachment":0,"cause":""})
				for key in ["affinity","trust","respect","attachment"]: rel[key]=clampi(int(rel[key])+int(world.life.socialDelta[key]),-100,100)
				rel.cause=event.id
				state.life.relations[actor][other]=rel
				state.agents[actor].relationships[other]=int(rel.affinity)
			for rule in world.life.requests:
				if state.life.quests.has(rule.id):
					var q: Dictionary=state.life.quests[rule.id]
					if q.status=="active" and pair.has(rule.actor) and pair.has(rule.target) and int(state.minute)<int(q.deadline):
						q.status="completed"
						q.updated=int(state.minute)
						q.cause=event.id
						effects.append({"actor":rule.actor,"text":"Выполнена просьба: "+str(rule.name),"data":{"cause":event.id,"request":rule.id,"status":"completed"}})
				elif pair.has(rule.actor) and pair.has(rule.issuer):
					state.life.quests[rule.id]={"status":"active","created":int(state.minute),"deadline":int(state.minute)+int(rule.deadlineMinutes),"updated":int(state.minute),"cause":event.id,"issuer":rule.issuer,"actor":rule.actor,"target":rule.target}
					effects.append({"actor":rule.actor,"text":"Принята просьба: "+str(rule.name),"data":{"cause":event.id,"request":rule.id,"status":"active"}})
	if event.type=="house" and state.life.goals[event.actor].has("housing"):
		state.life.goals[event.actor].housing={"kind":"housing","status":"completed","updated":int(state.minute),"cause":event.id}
		if str(event.data.get("previousHome",""))!=str(state.agents[event.actor].home):
			trace(state,event.actor,{"kind":"move","minute":int(state.minute),"cause":event.id,"from":str(event.data.get("previousHome","")),"to":str(state.agents[event.actor].home)})
	if event.type=="payment":
		for npc in world.agents:
			var delta:=int(event.data.get("amount",0))*(int(event.data.get("to","")==npc.account)-int(event.data.get("from","")==npc.account))
			if delta!=0: trace(state,npc.id,{"kind":"money","minute":int(state.minute),"cause":event.id,"delta":delta})
	if event.type in ["payment","obligation","obligation_settled"]:
		for npc in world.agents:
			var outstanding:=0
			for debt in state.get("obligations",[]):
				if debt.from==npc.account: outstanding+=int(debt.remaining)
			var goals: Dictionary=state.life.goals[npc.id]
			if outstanding>0 or goals.has("debt"):
				if not goals.has("debt") or int(goals.debt.amount)!=outstanding:
					goals.debt={"kind":"debt","status":"active" if outstanding>0 else "completed","amount":outstanding,"updated":int(state.minute),"cause":event.id}
	return effects

static func expire(world: Dictionary,state: Dictionary) -> Array:
	if not enabled(world): return []
	var effects:Array=[]
	for key in state.life.quests:
		var q: Dictionary=state.life.quests[key]
		if q.status=="active" and int(state.minute)>=int(q.deadline):
			q.status="expired"
			q.updated=int(state.minute)
			effects.append({"actor":q.actor,"text":"Истёк срок просьбы","data":{"cause":q.cause,"request":key,"status":"expired"}})
	return effects

static func active_rule(world: Dictionary,state: Dictionary,actor: String) -> Dictionary:
	var best: Dictionary={}
	if not enabled(world): return best
	for rule in world.life.requests:
		if state.life.quests.has(rule.id) and state.life.quests[rule.id].status=="active" and rule.actor==actor and (best.is_empty() or int(rule.priority)>int(best.priority)): best=rule
	return best

static func target(world: Dictionary,state: Dictionary,actor: String) -> String:
	return str(active_rule(world,state,actor).get("target",""))
