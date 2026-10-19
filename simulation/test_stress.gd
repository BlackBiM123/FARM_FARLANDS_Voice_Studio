extends SceneTree
const Core=preload("res://world_core.gd")
func _initialize() -> void:
	var args=OS.get_cmdline_user_args()
	var base: Dictionary=JSON.parse_string(FileAccess.get_file_as_string(args[0]))
	for count in [27,100]:
		var world=base.duplicate(true)
		while world.agents.size()<count:
			var number=world.agents.size()
			var actor=base.agents[0].duplicate(true)
			actor.id="stress_"+str(number)
			actor.name="Нагрузочный NPC "+str(number)
			actor.account=actor.id
			actor.role="resident"
			actor.goalHouse=false
			world.agents.append(actor)
			world.accounts.append({"id":actor.id,"name":actor.name,"balance":70})
		world.mechanics={"version":1,"modules":[{"id":"stress_module","name":"Тест подключения","version":1,"enabled":true,"variables":[{"id":"load","name":"Нагрузка","scope":"npc","unit":"ед.","min":0,"max":100,"initial":0,"perMinute":1},{"id":"clock","name":"Время","scope":"world","unit":"мин","min":0,"max":100000,"initial":0,"perMinute":1}],"actions":[{"id":"pause","name":"Тестовая пауза","variable":"load","when":"above","threshold":50,"priority":150,"minutes":5,"delta":-80,"place":"current"}]}]}
		var started=Time.get_ticks_msec()
		var a=Core.new()
		var history:Array=[]
		a.event_sink=func(event):history.append(event)
		a.start(world,"stress-"+str(count))
		var duration=43200 if count==27 else 10080
		for chunk in range(0,duration,240): a.advance(mini(240,duration-chunk))
		var run_error=a.error
		if run_error!="" and not run_error.contains("размер снимка"):
			fail(run_error)
			return
		if int(a.state.mechanics.values["stress_module:clock"].world)!=duration:
			fail("Мировой показатель зависит от числа NPC")
			return
		var report=a.snapshot()
		var size=JSON.stringify(report).to_utf8_buffer().size()
		if size>=3400000 or int(a.state.minute)<=360:
			fail("Снимок не укладывается в предел API: "+str(size))
			return
		if int(a.state.minute)!=360+duration or history.size()!=int(a.state.nextEvent)-1:
			fail("Не завершён полный прогон или потеряны события")
			return
		var restored=Core.new()
		restored.event_sink=func(_event):pass
		if not restored.restore(report):
			fail("Нагрузочный снимок не восстановлен: "+restored.error)
			return
		var b=Core.new()
		var resumed_history:Array=[]
		b.event_sink=func(event):resumed_history.append(event)
		b.start(world,"stress-"+str(count))
		for step in int(duration/60):
			b.advance(60)
			if step==int(duration/120)-1:
				var resumed=Core.new()
				resumed.event_sink=func(event):resumed_history.append(event)
				if not resumed.restore(JSON.parse_string(JSON.stringify(b.snapshot()))):
					fail("Не восстановлена середина длительного прогона: "+resumed.error)
					return
				b=resumed
			if b.error!="": break
		if JSON.stringify(JSON.parse_string(JSON.stringify(a.state)),"",true)!=JSON.stringify(JSON.parse_string(JSON.stringify(b.state)),"",true):
			fail("Состояние зависит от величины шага или восстановления на середине")
			return
		if JSON.stringify(JSON.parse_string(JSON.stringify(history)),"",true)!=JSON.stringify(JSON.parse_string(JSON.stringify(resumed_history)),"",true):
			fail("Полный журнал изменился после восстановления на середине")
			return
		var file=FileAccess.open(args[1]+"/stress-"+str(count)+".json",FileAccess.WRITE)
		report.archive=history
		file.store_string(JSON.stringify(report))
		file.close()
		print("Нагрузка: ",count," NPC; минута ",a.state.minute,"; байт ",size,"; мс ",Time.get_ticks_msec()-started,"; остановка по бюджету: ",run_error!="")
	quit(0)
func fail(message: String) -> void:
	printerr("FAIL: ",message)
	quit(1)
