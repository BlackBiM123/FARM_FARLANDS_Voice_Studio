extends SceneTree
func _initialize() -> void:
	var args=OS.get_cmdline_user_args()
	if args.size()<2:
		printerr("Использование: --script run.gd -- world.json report.json [minutes] [contentHash]")
		quit(2)
		return
	var data=JSON.parse_string(FileAccess.get_file_as_string(args[0]))
	var core=load("res://world_core.gd").new()
	if data.has("state"):
		if not core.restore(data):
			printerr(core.error)
			quit(2)
			return
	else:
		core.start(data,args[3] if args.size()>3 else FileAccess.get_file_as_string(args[0]).sha256_text())
	var report=core.advance(int(args[2]) if args.size()>2 else 10080)
	var file=FileAccess.open(args[1],FileAccess.WRITE)
	file.store_string(JSON.stringify(report))
	file.close()
	print("Симуляция: ",report.state.minute," мин; событий: ",report.state.events.size())
	quit(0)
