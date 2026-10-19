extends SceneTree
func _initialize() -> void:
	var args=OS.get_cmdline_user_args()
	if args.size()<2:
		printerr("Использование: --script run.gd -- world.json report.json [minutes] [contentHash]")
		quit(2)
		return
	var data=JSON.parse_string(FileAccess.get_file_as_string(args[0]))
	if not data is Dictionary:
		printerr("Не удалось прочитать JSON. Передайте абсолютный путь к файлу мира или снимку.")
		quit(2)
		return
	var core=load("res://world_core.gd").new()
	var history:Array=data.get("archive",data.get("state",{}).get("events",[])).duplicate(true)
	core.event_sink=func(event): history.append(event)
	if data.has("state"):
		if data.state.get("journalMode","")=="external" and history.size()!=int(data.state.nextEvent)-1:
			printerr("Нужен полный архив журнала")
			quit(2)
			return
		if not core.restore(data):
			printerr(core.error)
			quit(2)
			return
	else:
		core.start(data,args[3] if args.size()>3 else FileAccess.get_file_as_string(args[0]).sha256_text())
	var duration=int(args[2]) if args.size()>2 else 10080
	for offset in range(0,duration,240):
		core.advance(mini(240,duration-offset))
		if core.error!="":printerr(core.error);quit(2);return
	var report=core.snapshot()
	report.archive=history
	var file=FileAccess.open(args[1],FileAccess.WRITE)
	file.store_string(JSON.stringify(report))
	file.close()
	print("Симуляция: ",report.state.minute," мин; событий: ",report.state.events.size())
	quit(0)
