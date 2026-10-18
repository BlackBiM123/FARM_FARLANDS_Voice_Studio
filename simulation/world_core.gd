extends RefCounted
## Единое ядро: Godot Web, headless и игра используют этот файл без второй реализации.
const VERSION := "farlands-core-1"
var definition: Dictionary = {}
var state: Dictionary = {}
var error := ""

func start(world: Dictionary, content_hash: String) -> Dictionary:
	error = ""
	definition = world.duplicate(true)
	state = {"version":1,"coreVersion":VERSION,"contentHash":content_hash,"minute":360,"seed":int(world.seed),"rng":maxi(1,int(world.seed)),"agents":{},"accounts":{},"stocks":{},"owners":{},"events":[],"nextEvent":1,"productionMinutes":0,"ledger":[],"protectedFacts":world.protectedFacts.duplicate(),"baselineMoney":0,"baselineItems":{},"produced":{},"consumed":{}}
	for account in world.accounts:
		state.accounts[account.id] = int(account.balance)
		state.baselineMoney += int(account.balance)
	for stock in world.stocks:
		state.stocks[stock.id] = int(stock.amount)
		var item: String = stock.item
		state.baselineItems[item] = int(state.baselineItems.get(item,0)) + int(stock.amount)
	state.owners[world.house.place] = world.house.seller
	for npc in world.agents:
		state.agents[npc.id] = {"id":npc.id,"place":npc.home,"energy":900,"hunger":900,"action":{},"reason":"Начало дня","choices":[],"goal":"Собственный дом" if npc.goalHouse else "Работа и спокойная жизнь","knowledge":[],"relationships":{},"workMinutes":0,"lastPaidDay":-1,"home":npc.home,"ownsHouse":false}
	_event("start","","","Начало отдельного тестового мира. Авторские анкеты не изменяются.")
	return snapshot()

func restore(report: Dictionary) -> bool:
	error = ""
	if report.get("coreVersion","") != VERSION or report.get("contentHash","") != report.get("state",{}).get("contentHash","!"):
		error = "Несовместимый отчёт или версия ядра"
		return false
	var candidate: Dictionary = report.get("state",{})
	if int(candidate.get("minute",-1)) < 0 or not candidate.has("agents") or not candidate.has("accounts"):
		error = "Неполный снимок"
		return false
	definition = report.definition.duplicate(true)
	state = candidate.duplicate(true)
	for npc in definition.agents:
		if not state.agents.has(npc.id):
			error = "В снимке нет NPC"
			return false
	return true

func snapshot() -> Dictionary:
	return {"version":1,"coreVersion":VERSION,"contentHash":state.get("contentHash",""),"definition":definition.duplicate(true),"state":state.duplicate(true)}

func advance(minutes: int) -> Dictionary:
	error = ""
	if state.is_empty():
		error = "Сначала создайте запуск"
		return {}
	if minutes < 0 or minutes > 20160 or int(state.minute)+minutes > 43560:
		error = "Один шаг до 14 дней; один запуск до 30 дней"
		return snapshot()
	for tick in minutes:
		state.minute += 1
		var clock := int(state.minute) % 1440
		if clock == 360:
			_dawn()
		for npc in definition.agents:
			_tick(npc, state.agents[npc.id])
	return snapshot()

func _dawn() -> void:
	for npc in definition.agents:
		var a: Dictionary = state.agents[npc.id]
		a.workMinutes = 0
		if not a.ownsHouse and int(npc.rent) > 0:
			_pay(npc.account,"inn_business",int(npc.rent),"rent:"+npc.id+":"+str(_day()),npc.id,"Аренда комнаты")
	var outside_stock := _stock("pier","outside","potato")
	var inn_stock := _stock("tavern","inn_business","potato")
	if outside_stock!="" and inn_stock!="" and int(state.stocks[inn_stock])<20 and int(state.stocks[outside_stock])>=10:
		if _pay("inn_business","outside",10*_price("potato"),"import:"+str(_day()),"","Поставка еды с внешнего рынка"):
			state.stocks[outside_stock]-=10
			state.stocks[inn_stock]+=10
			_event("import","","tavern","Внешняя поставка: 10 картофеля. Запас и деньги списаны у реальных сторон.")
	_event("day","","","Начался день "+str(_day()+1))

func _tick(npc: Dictionary, a: Dictionary) -> void:
	a.hunger = maxi(0,int(a.hunger)-1)
	var action: Dictionary = a.action
	if not action.is_empty():
		if action.type == "rest":
			a.energy = mini(1000,int(a.energy)+5)
		else:
			a.energy = maxi(0,int(a.energy)-1)
		action.remaining = int(action.remaining)-1
		if action.type == "work":
			a.workMinutes += 1
			if npc.role == "farmer":
				_produce(npc)
		if action.type == "travel":
			action.elapsed = int(action.elapsed)+1
			var legs: Array = action.legs
			var accumulated := 0
			for leg in legs:
				accumulated += int(leg.minutes)
				if int(action.elapsed) == accumulated:
					a.place = leg.to
		if int(action.remaining) <= 0:
			a.action = {}
			_finish(npc,a,action)
		return
	_choose(npc,a)

func _choose(npc: Dictionary, a: Dictionary) -> void:
	var clock := int(state.minute)%1440
	var work_score := 80 if clock >= 480 and clock < 960 and npc.role!="resident" else -1
	var sleep_score := 100 if clock < 360 or clock >= 1320 else (130 if int(a.energy)<150 else -1)
	var eat_score := 120 if int(a.hunger)<300 else -1
	var house: Dictionary = definition.house
	var buy_score := 95 if npc.goalHouse and not a.ownsHouse and int(state.accounts[npc.account])>=int(house.price) and state.owners.get(house.place,"")==house.seller else -1
	var evening := clock>=1020 and clock<1260
	var social_score := 40 if evening else -1
	var delivery_score := 55+int(npc.helpfulness)/8 if npc.role=="stable" and clock>=960 and clock<1200 and not state.ledger.has("delivery:"+str(_day())) and _stock_amount(definition.production.place,definition.production.owner,definition.production.output)>=2 else -1
	a.choices = [{"action":"Отдых","score":sleep_score,"reason":"Ночь или критическая усталость"},{"action":"Поесть","score":eat_score,"reason":"Голод и реальный запас еды"},{"action":"Купить дом","score":buy_score,"reason":"Достаточно собственных средств и есть продавец"},{"action":"Работа","score":work_score,"reason":"Обязательство 08:00–16:00"},{"action":"Перевозка","score":delivery_score,"reason":"Есть груз фермы; оплачивает таверна"},{"action":"Общение","score":social_score,"reason":"Свободный вечер и согласие второго участника"},{"action":"Свободное время","score":0,"reason":"Нет более важных доступных дел"}]
	var best: Dictionary = a.choices[0]
	for choice in a.choices:
		if int(choice.score)>int(best.score):
			best=choice
	a.reason = best.reason
	var alternatives: Array=[]
	for option in a.choices:
		if option.action!=best.action and alternatives.size()<2:
			alternatives.append({"action":option.action,"score":option.score})
	_event("decision",npc.id,a.place,"Выбрано: "+best.action+" · "+best.reason,{"score":best.score,"alternatives":alternatives,"goal":a.goal})
	match best.action:
		"Отдых": _at(npc,a,a.home,{"type":"rest","remaining":60})
		"Поесть":
			if int(state.accounts[npc.account]) >= _price("potato") and _stock_amount("tavern","inn_business","potato")>0:
				_at(npc,a,"tavern",{"type":"eat","remaining":15})
			else:
				a.reason = "Нет денег или еды; поиск доступной работы, без создания ресурсов"
				_at(npc,a,npc.work,{"type":"work","remaining":30})
		"Купить дом": _at(npc,a,house.place,{"type":"buy","remaining":15})
		"Работа": _at(npc,a,npc.work,{"type":"work","remaining":mini(60,960-clock)})
		"Перевозка": _at(npc,a,definition.production.place,{"type":"pickup","remaining":5})
		"Общение": _at(npc,a,"tavern",{"type":"meet","remaining":1})
		_: _at(npc,a,a.home,{"type":"idle","remaining":20+_random(21)})

func _at(npc: Dictionary, a: Dictionary, place: String, next: Dictionary) -> void:
	if not _exists(place):
		a.reason = "Место не существует в мире: "+place
		a.action = {"type":"idle","remaining":20+_random(21)}
		return
	if a.place == place:
		a.action = next
		return
	var legs := _path(a.place,place)
	if legs.is_empty():
		a.reason = "Нет открытого пешего маршрута к "+place
		a.action = {"type":"idle","remaining":20+_random(21)}
		return
	var duration := 0
	for leg in legs:
		duration += int(leg.minutes)
	a.action = {"type":"travel","remaining":duration,"total":duration,"elapsed":0,"from":a.place,"to":place,"legs":legs,"after":next}
	_event("travel",npc.id,a.place,"Отправление: "+_place_name(place)+" · "+str(duration)+" мин",{"to":place})

func _finish(npc: Dictionary, a: Dictionary, action: Dictionary) -> void:
	match action.type:
		"travel":
			a.place = action.to
			a.action = action.after
			_event("arrive",npc.id,a.place,"Прибытие: "+_place_name(a.place))
		"work":
			if int(a.workMinutes)>=240 and int(a.lastPaidDay)!=_day():
				if _pay(npc.employer,npc.account,int(npc.wage),"wage:"+npc.id+":"+str(_day()),npc.id,"Оплата работы"):
					a.lastPaidDay=_day()
		"eat":
			var stock := _stock("tavern","inn_business","potato")
			if stock!="" and int(state.stocks[stock])>0 and _pay(npc.account,"inn_business",_price("potato"),"meal:"+npc.id+":"+str(state.minute),npc.id,"Покупка еды"):
				state.stocks[stock]-=1
				state.consumed.potato=int(state.consumed.get("potato",0))+1
				a.hunger=mini(1000,int(a.hunger)+650)
				_event("eat",npc.id,a.place,"Поел: расход 1 картофеля")
		"buy":
			var h: Dictionary = definition.house
			if state.owners.get(h.place,"")==h.seller and _pay(npc.account,h.seller,int(h.price),"house:"+h.place,npc.id,"Покупка собственного дома"):
				state.owners[h.place]=npc.account
				a.ownsHouse=true
				a.home=h.place
				a.goal="Обустроить дом и продолжать работу"
				_event("house",npc.id,a.place,"Первый ключ: дом куплен на собственные средства")
		"pickup":
			var pr: Dictionary = definition.production
			var stock := _stock(pr.place,pr.owner,pr.output)
			if stock!="" and int(state.stocks[stock])>=2 and not state.ledger.has("delivery:"+str(_day())):
				state.stocks[stock]-=2
				state.ledger.append("delivery:"+str(_day()))
				a.cargo={"item":pr.output,"amount":2,"owner":pr.owner,"source":stock}
				_at(npc,a,"tavern",{"type":"deliver","remaining":5})
		"deliver":
			if a.has("cargo"):
				var cargo: Dictionary = a.cargo
				var target := _stock("tavern","inn_business",cargo.item)
				if target!="" and _pay("inn_business",cargo.owner,int(cargo.amount)*_price(cargo.item),"shipment:"+str(_day()),npc.id,"Таверна оплатила груз фермы"):
					state.stocks[target]+=int(cargo.amount)
					_event("delivery",npc.id,a.place,"Доставлена мука: 2 шт. Владелец груза сменился после оплаты.")
				else:
					# Неоплаченный груз остаётся у перевозчика; возвращается по реальному пути.
					_at(npc,a,definition.production.place,{"type":"return_cargo","remaining":5})
					return
				a.erase("cargo")
		"return_cargo":
			if a.has("cargo"):
				state.stocks[a.cargo.source]+=int(a.cargo.amount)
				a.erase("cargo")
		"meet": _meet(npc,a)
		"social":
			if action.get("leader",false):
				var other: String = action.other
				if state.agents.has(other):
					a.relationships[other]=mini(100,int(a.relationships.get(other,0))+1)
					var b: Dictionary=state.agents[other]
					b.relationships[npc.id]=mini(100,int(b.relationships.get(npc.id,0))+1)
					_event("social",npc.id,a.place,"Совместный разговор: "+npc.name+" и "+_agent_name(other),{"other":other})

func _meet(npc: Dictionary, a: Dictionary) -> void:
	var key: String = "social:"+npc.id+":"+str(_day())
	if state.ledger.has(key):
		a.action={"type":"idle","remaining":20+_random(21)}
		return
	for other in definition.agents:
		if other.id==npc.id:
			continue
		var b: Dictionary=state.agents[other.id]
		if b.place==a.place and (b.action.is_empty() or b.action.type in ["idle","meet"]):
			state.ledger.append(key)
			state.ledger.append("social:"+other.id+":"+str(_day()))
			a.action={"type":"social","remaining":20,"other":other.id,"leader":true}
			b.action={"type":"social","remaining":20,"other":npc.id,"leader":false}
			a.reason="Оба участника свободны, находятся рядом и согласились на разговор"
			b.reason=a.reason
			return
	a.action={"type":"idle","remaining":20}
	a.reason="Собеседник занят или отсутствует; разговор не создан"

func _produce(npc: Dictionary) -> void:
	var p: Dictionary=definition.production
	if npc.work!=p.place:
		return
	state.productionMinutes+=1
	if int(state.productionMinutes)<int(p.minutes):
		return
	state.productionMinutes=0
	var input := _stock(p.place,p.owner,p.input)
	var output := _stock(p.place,p.owner,p.output)
	if input=="" or output=="" or int(state.stocks[input])<int(p.inputAmount):
		_event("blocked",npc.id,p.place,"Производство остановлено: нет входных ресурсов")
		return
	state.stocks[input]-=int(p.inputAmount)
	state.stocks[output]+=int(p.outputAmount)
	state.consumed[p.input]=int(state.consumed.get(p.input,0))+int(p.inputAmount)
	state.produced[p.output]=int(state.produced.get(p.output,0))+int(p.outputAmount)
	_event("production",npc.id,p.place,"Переработка "+str(p.input)+" → "+str(p.output)+": расход сырья и "+str(p.minutes)+" минут труда")

func _pay(from: String,to: String,amount: int,key: String,actor: String,text: String) -> bool:
	if state.ledger.has(key) or not state.accounts.has(from) or not state.accounts.has(to) or int(state.accounts[from])<amount or amount<0:
		return false
	state.accounts[from]-=amount
	state.accounts[to]+=amount
	state.ledger.append(key)
	_event("payment",actor,state.agents.get(actor,{}).get("place",""),text+": "+str(amount),{"from":from,"to":to,"amount":amount})
	return true

func _event(type: String,actor: String,place: String,text: String,data: Dictionary={}) -> void:
	var witnesses: Array=[]
	for key in state.agents:
		var a: Dictionary=state.agents[key]
		if key==actor or (type!="decision" and place!="" and a.place==place and not a.action.get("type","") in ["travel","rest"]):
			witnesses.append(key)
	var event_id := "event_"+str(state.nextEvent)
	state.nextEvent+=1
	state.events.append({"id":event_id,"minute":state.minute,"type":type,"actor":actor,"place":place,"text":text,"witnesses":witnesses,"data":data})
	for key in witnesses:
		state.agents[key].knowledge.append(event_id)

func _path(from: String,to: String) -> Array:
	var dist: Dictionary={from:0}
	var prev: Dictionary={}
	var open: Array=[from]
	while not open.is_empty():
		var current: String=open[0]
		for key in open:
			if int(dist[key])<int(dist[current]):
				current=key
		open.erase(current)
		if current==to:
			var result: Array=[]
			while current!=from:
				result.push_front(prev[current])
				current=prev[current].from
			return result
		for r in definition.routes:
			if not r.open or r.mode!="walk":
				continue
			var next: String=r.to if r.from==current else (r.from if r.to==current else "")
			if next=="" or not _exists(next):
				continue
			var cost := int(dist[current])+int(r.minutes)
			if not dist.has(next) or cost<int(dist[next]):
				dist[next]=cost
				prev[next]={"from":current,"to":next,"minutes":int(r.minutes),"routeId":r.id}
				if not open.has(next):
					open.append(next)
	return []

func _stock(place: String,owner: String,item: String) -> String:
	for stock in definition.stocks:
		if stock.place==place and stock.owner==owner and stock.item==item:
			return stock.id
	return ""
func _stock_amount(place: String,owner: String,item: String) -> int:
	return int(state.stocks.get(_stock(place,owner,item),0))
func _price(item: String) -> int:
	for row in definition.items:
		if row.id==item:
			return int(row.price)
	return 0
func _exists(place: String) -> bool:
	for row in definition.places:
		if row.id==place:
			return row.exists
	return false
func _day() -> int:
	return int(state.minute)/1440
func _place_name(place: String) -> String:
	for row in definition.places:
		if row.id==place:
			return row.name
	return place
func _agent_name(id: String) -> String:
	for row in definition.agents:
		if row.id==id:
			return row.name
	return id


func _random(limit: int) -> int:
	state.rng = (int(state.rng)*48271)%2147483647
	return int(state.rng)%maxi(1,limit)
