extends SceneTree
const Core=preload("res://world_core.gd")
var failed: Array[String]=[]
func _initialize() -> void:
	var args=OS.get_cmdline_user_args()
	var world: Dictionary=JSON.parse_string(FileAccess.get_file_as_string(args[0]))
	var baseline=world.duplicate(true)
	var a=Core.new()
	a.start(world,"test-hash")
	a.advance(10080)
	var report: Dictionary=a.snapshot()
	check(report.state.events.any(func(e):return e.type=="house"),"Тео самостоятельно купил дом")
	check(report.state.events.any(func(e):return e.type=="delivery"),"Есть реальная перевозка")
	check(report.state.events.any(func(e):return e.type=="social"),"Есть согласованный разговор")
	conservation(report)
	check(JSON.stringify(world)==JSON.stringify(baseline),"Авторские определения не меняются")
	var b=Core.new()
	b.start(world,"test-hash")
	for i in 168:
		b.advance(60)
	check(JSON.stringify(a.state,"",true)==JSON.stringify(b.state,"",true),"Шаги 60 минут и 7 дней дают одно состояние")
	var c=Core.new()
	c.start(world,"test-hash")
	c.advance(5040)
	var saved=c.snapshot()
	var d=Core.new()
	check(d.restore(saved),"Снимок принят")
	d.advance(5040)
	check(JSON.stringify(a.state,"",true)==JSON.stringify(d.state,"",true),"Продолжение снимка совпадает с непрерывным запуском")
	var empty=world.duplicate(true)
	for stock in empty.stocks:
		stock.amount=0
	var e=Core.new()
	e.start(empty,"empty")
	e.advance(1440)
	check(e.state.produced.is_empty(),"Нет производства без сырья")
	conservation(e.snapshot())
	var closed=world.duplicate(true)
	for route in closed.routes:
		route.open=false
	var f=Core.new()
	f.start(closed,"closed")
	f.advance(1440)
	check(f.state.agents[world.agents[0].id].place==world.agents[0].home,"Закрытые дороги не телепортируют NPC")
	conservation(f.snapshot())
	var long_run=Core.new()
	long_run.start(world,"long")
	long_run.advance(20160)
	long_run.advance(20160)
	long_run.advance(2880)
	conservation(long_run.snapshot())
	var before=int(long_run.state.minute)
	var shortage=world.duplicate(true)
	for stock in shortage.stocks:
		if stock.place=="tavern" and stock.item=="potato": stock.amount=0
	var shipping=Core.new()
	shipping.start(shortage,"shipping")
	var in_flight=false
	for minute in 1440:
		shipping.advance(1)
		for actor in shipping.state.agents.values():
			if actor.get("cargo",{}).get("item","")=="potato":
				in_flight=true
				check(shipping.state.stocks["food_inn"]==0,"Еда не появляется до прибытия")
				var resumed=Core.new()
				check(resumed.restore(shipping.snapshot()),"Восстановление с грузом")
				resumed.advance(90)
				shipping.advance(90)
				check(JSON.stringify(shipping.state,"",true)==JSON.stringify(resumed.state,"",true),"Перевозка продолжается без дублирования")
				break
		if in_flight: break
	check(in_flight,"Дефицит создаёт настоящий груз у перевозчика")
	shipping.advance(1440)
	check(shipping.state.events.any(func(event): return event.type=="delivery" and event.text.contains("potato")),"Внешняя еда прибывает реальным маршрутом")
	conservation(shipping.snapshot())
	var damaged=shipping.snapshot()
	damaged.state.agents.erase(world.agents[0].id)
	var intact=JSON.stringify(shipping.state,"",true)
	check(not shipping.restore(damaged),"Повреждённый снимок отклонён")
	check(JSON.stringify(shipping.state,"",true)==intact,"Ошибка загрузки сохраняет прежний мир")
	var counterfeit=shipping.snapshot()
	counterfeit.state.accounts[world.agents[0].account]+=100
	check(not shipping.restore(counterfeit),"Созданные из воздуха деньги отклоняются")
	check(JSON.stringify(shipping.state,"",true)==intact,"Проверка баланса атомарна")
	var overloaded=shortage.duplicate(true)
	for npc in overloaded.agents: npc.carryCapacity=0.1
	var light=Core.new()
	light.start(overloaded,"light")
	light.advance(1440)
	check(not light.state.events.any(func(event): return event.type=="pickup"),"Груз тяжелее грузоподъёмности не погружается")
	var isolated=shortage.duplicate(true)
	for road in isolated.routes: road.open=false
	var island=Core.new()
	island.start(isolated,"island")
	island.advance(2880)
	check(int(island.state.stocks.food_inn)==0,"Закрытый маршрут не создаёт внешнюю поставку")
	conservation(island.snapshot())
	var budget=Core.new()
	budget.start(world,"budget")
	for event_index in 13999: budget._event("test","","","Проверка бюджета журнала")
	var budget_before=int(budget.state.minute)
	budget.advance(60)
	check(budget.error!="" and int(budget.state.minute)==budget_before,"Лимит журнала явно останавливает расчёт без скрытой потери времени")
	check(budget.state.events.size()==14000,"История не обрезается молча")
	long_run.advance(1)
	check(int(long_run.state.minute)==before and long_run.error!="","Ограничение длины запуска не меняет состояние")
	for problem in failed:
		printerr("FAIL: ",problem)
	print("Проверки ядра: ","OK" if failed.is_empty() else "FAIL", "; событий за 30 дней: ",long_run.state.events.size())
	quit(0 if failed.is_empty() else 1)
func check(value: bool,label: String) -> void:
	if not value:
		failed.append(label)
func conservation(report: Dictionary) -> void:
	var s: Dictionary=report.state
	var money:=0
	for value in s.accounts.values():
		money+=int(value)
		check(int(value)>=0,"Нет отрицательных денег")
	check(money==int(s.baselineMoney),"Деньги не создаются и не исчезают")
	for item in s.baselineItems:
		var count:=0
		for stock in report.definition.stocks:
			check(int(s.stocks[stock.id])>=0,"Нет отрицательных запасов")
			if stock.item==item:
				count+=int(s.stocks[stock.id])
		for npc in s.agents.values():
			if npc.has("cargo") and npc.cargo.item==item:
				count+=int(npc.cargo.amount)
		check(count==int(s.baselineItems[item])+int(s.produced.get(item,0))-int(s.consumed.get(item,0)),"Баланс товара: "+item)
	check(JSON.stringify(s.protectedFacts)==JSON.stringify(report.definition.protectedFacts),"Лор защищён")
	var ids: Dictionary={}
	for event in s.events:
		check(not ids.has(event.id),"Событие не повторяется")
		ids[event.id]=true
		for npc_id in s.agents:
			if s.agents[npc_id].knowledge.has(event.id):
				check(event.witnesses.has(npc_id),"Знание только у свидетеля/участника")
