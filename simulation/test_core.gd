extends SceneTree
const Core=preload("res://world_core.gd")
var failed: Array[String]=[]
func _initialize() -> void:
	var args=OS.get_cmdline_user_args()
	var world: Dictionary=JSON.parse_string(FileAccess.get_file_as_string(args[0]))
	test_mechanics(world)
	test_cooking(world)
	test_needs(world)
	var baseline=world.duplicate(true)
	var routes=Core.new()
	routes.start(world,"routes")
	var path=routes._path("tavern","pier")
	check(JSON.stringify(path)==JSON.stringify(routes._path_uncached("tavern","pier")),"Кеш не меняет кратчайший маршрут")
	if not path.is_empty(): path[0].minutes=999
	check(routes._path("tavern","pier")[0].minutes!=999,"Путешествия не разделяют изменяемые участки пути")
	var closed_routes=world.duplicate(true)
	for edge in closed_routes.routes: edge.open=false
	routes.start(closed_routes,"closed-routes")
	check(routes._path("tavern","pier").is_empty(),"Новый запуск сбрасывает старые маршруты")
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
	var jobs_world=world.duplicate(true)
	jobs_world.agents[1].role="stable"
	for stock in jobs_world.stocks:
		if stock.id=="food_inn": stock.amount=0
	var jobs=Core.new()
	jobs.start(jobs_world,"claims")
	jobs.state.minute=480
	jobs._choose(jobs_world.agents[0],jobs.state.agents[jobs_world.agents[0].id])
	check(jobs._job_claimed("import_pickup",jobs_world.agents[1].id),"Заказ закреплён уже во время пути к погрузке")
	jobs._choose(jobs_world.agents[1],jobs.state.agents[jobs_world.agents[1].id])
	var second_action: Dictionary=jobs.state.agents[jobs_world.agents[1].id].action
	check(second_action.get("after",second_action).get("type","")!="import_pickup","Второй перевозчик не идёт за тем же заказом")
	var jobs_copy=Core.new()
	check(jobs_copy.restore(jobs.snapshot()),"Снимок с закреплённой перевозкой принят")
	check(jobs_copy._job_claimed("import_pickup",jobs_world.agents[1].id),"Загрузка не освобождает чужой заказ")
	# Пока перевозчик шёл, внешний запас израсходован другим участником рынка.
	for sim in [jobs,jobs_copy]:
		var removed=int(sim.state.stocks.external_food)
		sim.state.stocks.external_food=0
		sim.state.consumed.potato=int(sim.state.consumed.get("potato",0))+removed
		sim.advance(90)
	check(jobs.state.events.any(func(event): return event.type=="plan_failed" and event.actor==jobs_world.agents[0].id),"Срыв погрузки объяснён событием")
	check(not jobs._job_claimed("import_pickup",jobs_world.agents[1].id),"Отменённый заказ освобождён")
	check(JSON.stringify(jobs.state,"",true)==JSON.stringify(jobs_copy.state,"",true),"Пересмотр плана после восстановления совпадает")
	conservation(jobs.snapshot())
	var meetings=Core.new()
	meetings.start(world,"meetings")
	for actor in meetings.state.agents.values(): actor.place="tavern"
	meetings.state.ledger.append("social:"+world.agents[1].id+":0")
	meetings._meet(world.agents[0],meetings.state.agents[world.agents[0].id])
	check(meetings.state.agents[world.agents[0].id].action.get("other","")==world.agents[2].id,"Участник с завершённой дневной встречей не назначается повторно")
	# Нехватка денег работодателя не отменяет уже заработанную зарплату.
	var poor_world=world.duplicate(true)
	for wallet in poor_world.accounts:
		if wallet.id=="stable_business": wallet.balance=7
	var poor=Core.new()
	poor.start(poor_world,"poor")
	poor.advance(720)
	var wages=poor.state.obligations.filter(func(debt):return debt.kind=="wage" and debt.actor==world.agents[0].id)
	check(wages.size()==1,"Дневная зарплата начислена ровно один раз")
	check(wages.size()==1 and int(wages[0].remaining)==int(world.agents[0].wage)-7,"Недостаток денег создаёт остаток долга, доступная часть выплачена")
	conservation(poor.snapshot())
	var copy=Core.new()
	check(copy.restore(poor.snapshot()),"Снимок с задолженностью восстановлен")
	poor._pay("outside","stable_business",100,"funding","","Пополнение работодателя")
	copy._pay("outside","stable_business",100,"funding","","Пополнение работодателя")
	poor.advance(60)
	copy.advance(60)
	check(JSON.stringify(poor.state,"",true)==JSON.stringify(copy.state,"",true),"Продолжение задолженности детерминировано")
	check(int(wages[0].remaining)==0,"Долг погашен после реального пополнения счёта")
	var wage_count=poor.state.obligations.filter(func(debt):return debt.kind=="wage" and debt.actor==world.agents[0].id).size()
	check(wage_count==1,"Повторная работа не создаёт вторую зарплату за тот же день")
	conservation(poor.snapshot())
	var rent_world=world.duplicate(true)
	for wallet in rent_world.accounts:
		if wallet.id==world.agents[0].account: wallet.balance=0
	var rent=Core.new()
	rent.start(rent_world,"rent")
	rent._oblige(world.agents[0].account,"inn_business",5,"rent_test",world.agents[0].id,"rent","Аренда")
	check(int(rent.state.obligations[0].remaining)==5,"Нет денег — аренда остаётся обязательством")
	rent._pay("outside",world.agents[0].account,2,"fund_rent","","Пополнение")
	rent._settle_obligations()
	check(int(rent.state.obligations[0].remaining)==3,"Аренда погашается частично без создания денег")
	rent._pay("outside",world.agents[0].account,int(world.house.price),"fund_house","","Пополнение")
	check(rent._available(world.agents[0].account)==int(world.house.price)-3,"Долг вычитается из средств на долгосрочную цель")
	rent._choose(rent_world.agents[0],rent.state.agents[world.agents[0].id])
	var house_choice=rent.state.agents[world.agents[0].id].choices.filter(func(choice):return choice.action=="Купить дом")
	check(int(house_choice[0].score)<0,"Деньги под обязательства не тратятся на дом")
	conservation(rent.snapshot())
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

func test_needs(world: Dictionary) -> void:
	var configured=world.duplicate(true)
	configured.needs={"initialEnergy":800,"initialFullness":200,"fullnessDrain":0,"energyDrain":2,"restGain":9,"mealGain":400,"eatThreshold":201,"restThreshold":100,"eatPriority":190,"restPriority":180,"nightPriority":90}
	var core=Core.new()
	core.start(configured,"needs")
	var npc: Dictionary=configured.agents[0]
	var actor: Dictionary=core.state.agents[npc.id]
	check(actor.energy==800 and actor.hunger==200,"Начальные потребности берутся из правил")
	core.advance(1)
	check(actor.hunger==200,"Нулевой расход сытости работает")
	check(actor.choices.any(func(c):return c.action=="Поесть" and c.score==190),"Порог и приоритет еды меняют выбор ядра")
	actor.action={"type":"rest","remaining":10}
	core._tick(npc,actor)
	check(actor.energy==809,"Скорость восстановления энергии настраивается")
	actor.action={"type":"idle","remaining":10}
	core._tick(npc,actor)
	check(actor.energy==807,"Скорость расхода энергии настраивается")
	var straight=Core.new()
	straight.start(configured,"needs")
	straight.advance(120)
	var split=Core.new()
	split.start(configured,"needs")
	split.advance(60)
	var restored=Core.new()
	check(restored.restore(JSON.parse_string(JSON.stringify(split.snapshot()))),"Настроенные потребности восстанавливаются из JSON")
	restored.advance(60)
	check(JSON.stringify(JSON.parse_string(JSON.stringify(straight.state)),"",true)==JSON.stringify(JSON.parse_string(JSON.stringify(restored.state)),"",true),"Настройки потребностей сохраняются при продолжении")

func kitchen_world(world: Dictionary) -> Dictionary:
	var w=world.duplicate(true)
	w.items.append({"id":"cooked_meal","name":"Блюдо","weight":0.3,"price":3})
	w.stocks.append({"id":"kitchen_meals","place":"tavern","owner":"inn_business","item":"cooked_meal","amount":0})
	w.cooking={"enabled":true,"input":"flour","output":"cooked_meal","inputAmount":1,"outputAmount":4,"minutes":30}
	return w

func test_cooking(world: Dictionary) -> void:
	var configured=kitchen_world(world)
	var core=Core.new()
	core.start(configured,"kitchen")
	core.advance(4320)
	check(int(core.state.produced.get("cooked_meal",0))>0,"Кухня готовит из доставленной муки")
	check(int(core.state.consumed.get("cooked_meal",0))>0,"Жители покупают и едят готовые блюда")
	check(int(core.state.consumed.get("potato",0))==0,"Режим кухни не выдаёт сырой картофель за готовый обед")
	var delivery_minute: int=-1
	var cooking_minute: int=-1
	for event in core.state.events:
		if event.type=="delivery" and delivery_minute<0: delivery_minute=int(event.minute)
		if event.type=="cooking" and cooking_minute<0: cooking_minute=int(event.minute)
	check(delivery_minute>=0 and cooking_minute>=delivery_minute+29,"Первое блюдо требует доставки и времени труда")
	conservation(core.snapshot())
	var no_routes=configured.duplicate(true)
	for edge in no_routes.routes: edge.open=false
	var isolated=Core.new()
	isolated.start(no_routes,"isolated-kitchen")
	isolated.advance(2880)
	check(int(isolated.state.produced.get("cooked_meal",0))==0,"Без доставки кухня не создаёт еду")
	conservation(isolated.snapshot())
	var no_cook=configured.duplicate(true)
	for npc in no_cook.agents:
		if npc.role=="innkeeper": npc.role="resident"
	var unstaffed=Core.new()
	unstaffed.start(no_cook,"unstaffed")
	unstaffed.advance(2880)
	check(int(unstaffed.state.produced.get("cooked_meal",0))==0,"Без труда повара блюда не появляются")
	var split=Core.new()
	split.start(configured,"kitchen")
	split.advance(1440)
	var restored=Core.new()
	check(restored.restore(JSON.parse_string(JSON.stringify(split.snapshot()))),"Кухня восстанавливается из JSON")
	restored.advance(2880)
	check(JSON.stringify(JSON.parse_string(JSON.stringify(core.state)),"",true)==JSON.stringify(JSON.parse_string(JSON.stringify(restored.state)),"",true),"Продолжение кухни совпадает с непрерывным расчётом")

func mechanics_world(world: Dictionary) -> Dictionary:
	var w=world.duplicate(true)
	w.mechanics={"version":1,"modules":[{"id":"test_module","name":"Тест расширения","version":1,"enabled":true,"variables":[{"id":"load","name":"Тестовая нагрузка","scope":"npc","unit":"ед.","min":0,"max":100,"initial":0,"perMinute":1},{"id":"clock","name":"Счётчик мира","scope":"world","unit":"мин","min":0,"max":100000,"initial":0,"perMinute":1}],"actions":[{"id":"pause","name":"Тестовая пауза","variable":"load","when":"above","threshold":10,"priority":200,"minutes":5,"delta":-20,"place":"current"}]}]}
	return w

func test_mechanics(world: Dictionary) -> void:
	var configured=mechanics_world(world)
	var original=JSON.stringify(configured)
	var core=Core.new()
	core.start(configured,"mechanics")
	core.advance(120)
	check(core.state.events.any(func(e):return e.type=="mechanic"),"Описанное действие подключается без нового кода основного цикла")
	check(int(core.state.mechanics.values["test_module:clock"].world)==120,"Показатель мира меняется один раз за минуту")
	for value in core.state.mechanics.values["test_module:load"].values(): check(int(value)>=0 and int(value)<=100,"Границы дополнительных показателей соблюдаются")
	check(JSON.stringify(configured)==original,"Модуль не переписывает авторские определения")
	conservation(core.snapshot())
	var single=configured.duplicate(true)
	single.agents=[single.agents[0]]
	var lone=Core.new()
	lone.start(single,"single")
	lone.advance(120)
	check(lone.state.mechanics.values["test_module:clock"].world==core.state.mechanics.values["test_module:clock"].world,"Скорость показателя мира не зависит от числа NPC")
	var split=Core.new()
	split.start(configured,"mechanics")
	split.advance(57)
	var restored=Core.new()
	check(restored.restore(JSON.parse_string(JSON.stringify(split.snapshot()))),"Состояние модуля восстанавливается из JSON")
	restored.advance(63)
	check(JSON.stringify(JSON.parse_string(JSON.stringify(core.state)),"",true)==JSON.stringify(JSON.parse_string(JSON.stringify(restored.state)),"",true),"Прогон модуля и продолжение дают одинаковое состояние")
	var bad=core.snapshot()
	bad.state.mechanics.versions.test_module=2
	var intact=JSON.stringify(restored.state,"",true)
	check(not restored.restore(bad),"Несовместимая версия модуля отклоняется")
	check(JSON.stringify(restored.state,"",true)==intact,"Отказ восстановления не меняет текущий запуск")
	bad=core.snapshot()
	bad.state.mechanics.values.erase("test_module:load")
	check(not restored.restore(bad),"Нельзя молча сбросить пропавший показатель")
	var disabled=configured.duplicate(true)
	disabled.mechanics.modules[0].enabled=false
	var off=Core.new()
	off.start(disabled,"off")
	off.advance(120)
	check(off.state.mechanics.values.is_empty() and not off.state.events.any(func(e):return e.type=="mechanic"),"Выключенный модуль не влияет на расчёт")
	var travel=configured.duplicate(true)
	travel.mechanics.modules[0].variables[0].initial=100
	travel.mechanics.modules[0].variables[0].perMinute=0
	travel.mechanics.modules[0].actions[0].place="home"
	var walker=Core.new()
	walker.start(travel,"walk")
	var npc: Dictionary=travel.agents[0]
	var actor: Dictionary=walker.state.agents[npc.id]
	actor.place=npc.work
	walker._choose(npc,actor)
	check(actor.action.type=="travel","Действие модуля дома требует реального путешествия")
	walker.advance(12)
	check(int(walker.state.mechanics.values["test_module:load"][npc.id])==100,"Эффект не возникает до завершения пути и действия")
	var resumed=Core.new()
	check(resumed.restore(JSON.parse_string(JSON.stringify(walker.snapshot()))),"Восстанавливается незавершённое действие модуля")
	walker.advance(3)
	resumed.advance(3)
	check(int(walker.state.mechanics.values["test_module:load"][npc.id])==80,"Эффект применяется один раз после пяти минут действия")
	check(JSON.stringify(JSON.parse_string(JSON.stringify(walker.state)),"",true)==JSON.stringify(JSON.parse_string(JSON.stringify(resumed.state)),"",true),"Продолжение незавершённого действия детерминировано")
	var legacy=Core.new()
	legacy.start(world,"old")
	var legacy_save=legacy.snapshot()
	legacy_save.state.erase("mechanics")
	var migrated=Core.new()
	check(migrated.restore(legacy_save) and migrated.state.mechanics.versions.core_needs==1,"Старое сохранение получает системный адаптер без сброса сытости")
