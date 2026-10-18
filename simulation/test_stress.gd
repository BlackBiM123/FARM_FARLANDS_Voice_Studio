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
		var started=Time.get_ticks_msec()
		var a=Core.new()
		a.start(world,"stress-"+str(count))
		a.advance(10080)
		var run_error=a.error
		if run_error!="" and not run_error.contains("размер снимка"):
			fail(run_error)
			return
		var report=a.snapshot()
		var size=JSON.stringify(report).to_utf8_buffer().size()
		if size>=3400000 or int(a.state.minute)<=360:
			fail("Снимок не укладывается в предел API: "+str(size))
			return
		var restored=Core.new()
		if not restored.restore(report):
			fail("Нагрузочный снимок не восстановлен: "+restored.error)
			return
		var b=Core.new()
		b.start(world,"stress-"+str(count))
		for step in 168:
			b.advance(60)
			if b.error!="": break
		if JSON.stringify(a.state,"",true)!=JSON.stringify(b.state,"",true):
			fail("Остановка по бюджету зависит от величины шага")
			return
		var file=FileAccess.open(args[1]+"/stress-"+str(count)+".json",FileAccess.WRITE)
		file.store_string(JSON.stringify(report))
		file.close()
		print("Нагрузка: ",count," NPC; минута ",a.state.minute,"; байт ",size,"; мс ",Time.get_ticks_msec()-started,"; остановка по бюджету: ",run_error!="")
	quit(0)
func fail(message: String) -> void:
	printerr("FAIL: ",message)
	quit(1)
