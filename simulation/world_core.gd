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
	state.obligations=[]
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
	if not report.get("definition") is Dictionary or int(candidate.get("minute",-1)) < 360 or int(candidate.get("minute",-1)) > 43560:
		error = "Неполный снимок"
		return false
	for field in ["agents","accounts","stocks","owners","baselineItems","produced","consumed"]:
		if not candidate.get(field) is Dictionary:
			error = "Неполный снимок: "+field
			return false
	for field in ["events","ledger","protectedFacts"]:
		if not candidate.get(field) is Array:
			error = "Неполный снимок: "+field
			return false
	for npc in report.definition.agents:
		if not candidate.agents.has(npc.id):
			error = "В снимке нет NPC"
			return false
	# Ошибка загрузки не должна уничтожать уже работающий мир.
	for value in candidate.accounts.values():
		if not (value is int or value is float) or value < 0:
			error = "Некорректный счёт в снимке"
			return false
	var initial_money:=0
	var actual_money:=0
	for account in report.definition.accounts:
		initial_money+=int(account.balance)
		if not candidate.accounts.has(account.id):
			error="Нет счёта в снимке"
			return false
	for value in candidate.accounts.values(): actual_money+=int(value)
	if actual_money!=initial_money or int(candidate.get("baselineMoney",-1))!=initial_money:
		error="Нарушен баланс денег снимка"
		return false
	for item in report.definition.items:
		var initial:=0
		var actual:=0
		for stock in report.definition.stocks:
			if not candidate.stocks.has(stock.id) or int(candidate.stocks[stock.id])<0:
				error="Некорректный запас снимка"
				return false
			if stock.item==item.id:
				initial+=int(stock.amount)
				actual+=int(candidate.stocks[stock.id])
		for actor in candidate.agents.values():
			if actor.get("cargo",{}).get("item","")==item.id: actual+=int(actor.cargo.amount)
		if actual!=initial+int(candidate.produced.get(item.id,0))-int(candidate.consumed.get(item.id,0)) or int(candidate.baselineItems.get(item.id,0))!=initial:
			error="Нарушен баланс товара снимка: "+str(item.id)
			return false
	if candidate.protectedFacts!=report.definition.protectedFacts:
		error="Изменены защищённые факты снимка"
		return false
	if not candidate.get("obligations",[]) is Array:
		error="Некорректные обязательства снимка"
		return false
	var debt_ids: Dictionary={}
	for debt in candidate.get("obligations",[]):
		if not debt is Dictionary or not debt.has_all(["id","from","to","amount","remaining","created","day","actor","kind","label"]):
			error="Неполное обязательство снимка"
			return false
		if debt_ids.has(debt.id) or not candidate.accounts.has(debt.from) or not candidate.accounts.has(debt.to) or not candidate.agents.has(debt.actor) or int(debt.remaining)<0 or int(debt.remaining)>int(debt.amount) or int(debt.created)>int(candidate.minute):
			error="Некорректное обязательство снимка"
			return false
		debt_ids[debt.id]=true
	definition = report.definition.duplicate(true)
	state = candidate.duplicate(true)
	if not state.has("obligations"): state.obligations=[]
	return true

func snapshot() -> Dictionary:
	return {"version":1,"rulesVersion":3,"coreVersion":VERSION,"contentHash":state.get("contentHash",""),"definition":definition.duplicate(true),"state":state.duplicate(true)}

func advance(minutes: int) -> Dictionary:
	error = ""
	if state.is_empty():
		error = "Сначала создайте запуск"
		return {}
	if minutes < 0 or minutes > 20160 or int(state.minute)+minutes > 43560:
		error = "Один шаг до 14 дней; один запуск до 30 дней"
		return snapshot()
	for tick in minutes:
		# Сохраняем полный журнал, а при достижении бюджета явно останавливаем запуск.
		# Нельзя продолжать расчёт, который уже невозможно восстановить из облака.
		if state.events.size()>=14000 or (tick%60==0 and JSON.stringify(snapshot()).to_utf8_buffer().size()>2800000):
			error="Достигнут безопасный размер снимка. Запуск остановлен; сохраните отчёт. Для более длинного прогона уменьшите число участников."
			break
		state.minute += 1
		var clock := int(state.minute) % 1440
		if clock == 360:
			_dawn()
		if clock%60==0: _settle_obligations()
		for npc in definition.agents:
			_tick(npc, state.agents[npc.id])
	return snapshot()

func _dawn() -> void:
	for npc in definition.agents:
		var a: Dictionary = state.agents[npc.id]
		a.workMinutes = 0
		if not a.ownsHouse and int(npc.rent) > 0:
			_oblige(npc.account,"inn_business",int(npc.rent),"rent:"+npc.id+":"+str(_day()),npc.id,"rent","Аренда комнаты")
	# Дефицит создаёт спрос на перевозку, но не телепортирует товар со склада.
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
	var buy_score := 95 if npc.goalHouse and not a.ownsHouse and _available(npc.account)>=int(house.price) and state.owners.get(house.place,"")==house.seller else -1
	var evening := clock>=1020 and clock<1260
	var social_score := 40 if evening else -1
	var delivery_score := 55+int(npc.helpfulness)/8 if npc.role=="stable" and clock>=960 and clock<1200 and not state.ledger.has("delivery:"+str(_day())) and _stock_amount(definition.production.place,definition.production.owner,definition.production.output)>=2 else -1
	var import_score := 110 if npc.role=="stable" and clock>=480 and clock<1200 and _stock_amount("tavern","inn_business","potato")<20 and _stock_amount("pier","outside","potato")>=10 and int(state.accounts.get("inn_business",0))>=10*_price("potato") and not _cargo_in_transit("potato") else -1
	if not _reachable(a.place,npc.work): work_score=-1
	if not _reachable(a.place,a.home): sleep_score=-1
	if not _reachable(a.place,house.place): buy_score=-1
	if not _reachable(a.place,"tavern"): social_score=-1
	if not _reachable(a.place,definition.production.place) or not _reachable(definition.production.place,"tavern"): delivery_score=-1
	if not _reachable(a.place,"pier") or not _reachable("pier","tavern"): import_score=-1
	if 10*_weight("potato")>float(npc.get("carryCapacity",10)): import_score=-1
	if 2*_weight(definition.production.output)>float(npc.get("carryCapacity",10)): delivery_score=-1
	if not _reachable(a.place,"tavern") or _stock_amount("tavern","inn_business","potato")==0 or int(state.accounts[npc.account])<_price("potato"): eat_score=-1
	a.choices = [{"action":"Отдых","score":sleep_score,"reason":"Ночь или критическая усталость"},{"action":"Поесть","score":eat_score,"reason":"Голод и реальный запас еды"},{"action":"Купить дом","score":buy_score,"reason":"Достаточно собственных средств и есть продавец"},{"action":"Работа","score":work_score,"reason":"Обязательство 08:00–16:00"},{"action":"Перевозка","score":delivery_score,"reason":"Есть груз фермы; оплачивает таверна"},{"action":"Общение","score":social_score,"reason":"Свободный вечер и согласие второго участника"},{"action":"Свободное время","score":0,"reason":"Нет более важных доступных дел"}]
	var best: Dictionary = a.choices[0]
	a.choices.append({"action":"Пополнить запас еды","score":import_score,"reason":"Таверне нужна еда; есть продавец, деньги и маршрут через причал"})
	for choice in a.choices:
		if int(choice.score)>int(best.score):
			best=choice
	a.reason = best.reason
	var alternatives: Array=[]
	var ranked: Array=a.choices.duplicate()
	ranked.sort_custom(func(left,right): return int(left.score)>int(right.score))
	for option in ranked:
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
		"Пополнить запас еды": _at(npc,a,"pier",{"type":"import_pickup","remaining":10})
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
		"import_pickup":
			var source := _stock("pier","outside","potato")
			if source!="" and int(state.stocks[source])>=10 and not _cargo_in_transit("potato") and 10*_weight("potato")<=float(npc.get("carryCapacity",10)):
				state.stocks[source]-=10
				a.cargo={"item":"potato","amount":10,"owner":"outside","source":source}
				_event("pickup",npc.id,a.place,"Погружено 10 картофеля: товар остаётся собственностью продавца до оплаты")
				_at(npc,a,"tavern",{"type":"deliver","remaining":10})
		"travel":
			a.place = action.to
			a.action = action.after
			_event("arrive",npc.id,a.place,"Прибытие: "+_place_name(a.place))
		"work":
			if int(a.workMinutes)>=240 and int(a.lastPaidDay)!=_day():
				_oblige(npc.employer,npc.account,int(npc.wage),"wage:"+npc.id+":"+str(_day()),npc.id,"wage","Оплата работы")
		"eat":
			var stock := _stock("tavern","inn_business","potato")
			if stock!="" and int(state.stocks[stock])>0 and _pay(npc.account,"inn_business",_price("potato"),"meal:"+npc.id+":"+str(state.minute),npc.id,"Покупка еды"):
				state.stocks[stock]-=1
				state.consumed.potato=int(state.consumed.get("potato",0))+1
				a.hunger=mini(1000,int(a.hunger)+650)
				_event("eat",npc.id,a.place,"Поел: расход 1 картофеля")
		"buy":
			var h: Dictionary = definition.house
			if state.owners.get(h.place,"")==h.seller and _available(npc.account)>=int(h.price) and _pay(npc.account,h.seller,int(h.price),"house:"+h.place,npc.id,"Покупка собственного дома"):
				state.owners[h.place]=npc.account
				a.ownsHouse=true
				a.home=h.place
				a.goal="Обустроить дом и продолжать работу"
				_event("house",npc.id,a.place,"Первый ключ: дом куплен на собственные средства")
		"pickup":
			var pr: Dictionary = definition.production
			var stock := _stock(pr.place,pr.owner,pr.output)
			if stock!="" and int(state.stocks[stock])>=2 and not state.ledger.has("delivery:"+str(_day())) and 2*_weight(pr.output)<=float(npc.get("carryCapacity",10)):
				state.stocks[stock]-=2
				state.ledger.append("delivery:"+str(_day()))
				a.cargo={"item":pr.output,"amount":2,"owner":pr.owner,"source":stock}
				_at(npc,a,"tavern",{"type":"deliver","remaining":5})
		"deliver":
			if a.has("cargo"):
				var cargo: Dictionary = a.cargo
				var target := _stock("tavern","inn_business",cargo.item)
				if target!="" and _pay("inn_business",cargo.owner,int(cargo.amount)*_price(cargo.item),"shipment:"+npc.id+":"+str(state.minute),npc.id,"Таверна оплатила доставленный груз"):
					state.stocks[target]+=int(cargo.amount)
					_event("delivery",npc.id,a.place,"Доставлено: "+str(cargo.item)+" × "+str(cargo.amount)+". Товар оплачен получателем.")
				else:
					# Неоплаченный груз остаётся у перевозчика; возвращается по реальному пути.
					_at(npc,a,_stock_place(cargo.source),{"type":"return_cargo","remaining":5})
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

func _available(account: String) -> int:
	var reserved:=0
	for debt in state.obligations:
		if debt.from==account: reserved+=int(debt.remaining)
	return maxi(0,int(state.accounts.get(account,0))-reserved)

func _oblige(from: String,to: String,amount: int,key: String,actor: String,kind: String,label: String) -> void:
	if state.ledger.has(key): return
	if amount==0:
		state.ledger.append(key)
		if kind=="wage": state.agents[actor].lastPaidDay=_day()
		return
	for debt in state.obligations:
		if debt.id==key: return
	var debt={"id":key,"from":from,"to":to,"amount":amount,"remaining":amount,"created":int(state.minute),"day":_day(),"actor":actor,"kind":kind,"label":label}
	state.obligations.append(debt)
	_event("obligation",actor,state.agents.get(actor,{}).get("place",""),label+": начислено "+str(amount),{"obligation":key,"from":from,"to":to,"amount":amount})
	_settle_obligations()

func _settle_obligations() -> void:
	for debt in state.obligations:
		if int(debt.remaining)<=0: continue
		var amount:=mini(int(debt.remaining),int(state.accounts.get(debt.from,0)))
		if amount>0 and _pay(debt.from,debt.to,amount,"settle:"+debt.id+":"+str(debt.remaining),debt.actor,debt.label):
			debt.remaining-=amount
		if int(debt.remaining)==0:
			state.ledger.append(debt.id)
			if debt.kind=="wage" and state.agents.has(debt.actor):
				state.agents[debt.actor].lastPaidDay=maxi(int(state.agents[debt.actor].lastPaidDay),int(debt.day))

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
func _stock_place(stock_id: String) -> String:
	for stock in definition.stocks:
		if stock.id==stock_id: return stock.place
	return ""
func _cargo_in_transit(item: String) -> bool:
	for a in state.agents.values():
		if a.get("cargo",{}).get("item","")==item: return true
	return false
func _reachable(from: String,to: String) -> bool:
	return _exists(to) and (from==to or not _path(from,to).is_empty())
func _stock_amount(place: String,owner: String,item: String) -> int:
	return int(state.stocks.get(_stock(place,owner,item),0))
func _price(item: String) -> int:
	for row in definition.items:
		if row.id==item:
			return int(row.price)
	return 0
func _weight(item: String) -> float:
	for row in definition.items:
		if row.id==item: return float(row.weight)
	return 0.0
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
