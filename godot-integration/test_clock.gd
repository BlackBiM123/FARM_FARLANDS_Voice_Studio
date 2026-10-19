extends Node
const Core=preload("res://addons/farlands_world/world_core.gd")
func _ready() -> void:
	GameClock.set_paused(true)
	await get_tree().process_frame
	var world: Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://world.json"))
	var service=load("res://addons/farlands_world/world_service.gd").new()
	service.name="WorldSimulation"
	get_tree().root.add_child(service)
	service.configure(world,"clock-test")
	GameClock.advance_minutes(600)
	if not check(int(service.core.state.minute)==960,"Дневные минуты проходят в ядро"):
		return
	GameClock.sleep()
	var standalone=Core.new()
	var history:Array=[]
	standalone.event_sink=func(event):history.append(event)
	standalone.start(world,"clock-test")
	standalone.advance(1440)
	if not check(history==service.journal,"Отдельный журнал совпадает при обработке сна"):
		return
	if not check(JSON.stringify(service.core.state,"",true)==JSON.stringify(standalone.state,"",true),"Сон обрабатывает всю ночь, а не только смену дня"):
		return
	var saved=SaveGame.collect_state()
	GameClock.advance_minutes(120)
	SaveGame.apply_state(saved)
	if not check(int(service.core.state.minute)==1800 and GameClock.day==2 and GameClock.minutes==360,"Общий слот восстанавливает часы и удалённых NPC"):
		return
	var before=JSON.stringify(service.core.state,"",true)
	var actor=load("res://addons/farlands_world/world_actor.gd").new()
	actor.npc_id=world.agents[0].id
	for p in world.places:
		actor.anchors[p.id]=Vector2(p.x,p.y)
	add_child(actor)
	await get_tree().physics_frame
	await get_tree().physics_frame
	if not check(actor.global_position==service.position_for(actor.npc_id,actor.anchors),"Ближняя проекция следует одному путешествию"):
		return
	actor.queue_free()
	await get_tree().process_frame
	if not check(before==JSON.stringify(service.core.state,"",true),"Выгрузка представления не меняет логическое состояние"):
		return
	print("OK: GameClock + сон + SaveGame + ближняя/дальняя проекция")
	get_tree().quit(0)
func check(value: bool,label: String) -> bool:
	if not value:
		printerr("FAIL: "+label)
		get_tree().quit(1)
	return value
