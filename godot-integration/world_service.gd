extends Node
## Постоянный владелец состояния всех NPC, включая отсутствующих на загруженной карте.
## Установка: autoload WorldSimulation после GameClock. EventBus остаётся шиной, не журналом.
const Core=preload("res://addons/farlands_world/world_core.gd")
var core=Core.new()
var active:=false
var last_error:=""
var journal:Array=[]
signal state_changed
func _ready() -> void:
	core.event_sink=func(event):journal.append(event)
	add_to_group("saveable")
	var clock=get_node_or_null("/root/GameClock")
	if clock:
		clock.minute_passed.connect(_on_minute)
		var bus=get_node_or_null("/root/EventBus")
		if bus:
			bus.day_changed.connect(_on_day)
	if FileAccess.file_exists("res://world/definition.json"):
		load_world("res://world/definition.json")
func configure(definition: Dictionary,content_hash: String) -> void:
	journal=[]
	core.start(definition,content_hash)
	active=true
	last_error=""
	_sync_clock()
	state_changed.emit()
func load_world(path: String) -> bool:
	var text=FileAccess.get_file_as_string(path)
	var parsed=JSON.parse_string(text)
	if typeof(parsed)!=TYPE_DICTIONARY or int(parsed.get("version",0))!=1:
		last_error="Неподдерживаемый пакет мира"
		return false
	configure(parsed,text.sha256_text())
	return true
func advance_to(absolute_minute: int) -> void:
	if not active:
		return
	var gap=absolute_minute-int(core.state.minute)
	if gap<0:
		last_error="Часы отстают от снимка мира; восстановите общий слот сохранения"
		return
	while gap>0:
		var chunk=mini(gap,20160)
		core.advance(chunk)
		if core.error!="":
			last_error=core.error
			return
		gap-=chunk
	state_changed.emit()
func _sync_clock() -> void:
	var clock=get_node_or_null("/root/GameClock")
	if clock and active:
		# Существующий GameClock держит 24:00–26:00 в предыдущем игровом дне.
		advance_to((int(clock.day)-1)*1440+int(clock.minutes))
func _on_minute(_minute: int) -> void:
	_sync_clock()
func _on_day(_day: int,_season: StringName) -> void:
	# Сон прыгает к утру; ядро обрабатывает весь интервал, включая ночные действия.
	_sync_clock()
func save_id() -> StringName:
	return &"world_simulation"
func save_state() -> Dictionary:
	if not active:return {}
	var report=core.snapshot()
	report.archive=journal.duplicate(true)
	return report
func load_state(data: Dictionary) -> void:
	if data.is_empty():
		return
	if data.state.get("journalMode","")=="external" and data.get("archive",[]).size()!=int(data.state.nextEvent)-1:
		last_error="Для восстановления нужен полный архив журнала, а не только компактный снимок"
		return
	if core.restore(data):
		journal=data.get("archive",data.state.events).duplicate(true)
		active=true
		last_error=""
		state_changed.emit()
	else:
		last_error=core.error
func position_for(npc_id: String,anchors: Dictionary) -> Vector2:
	if not active or not core.state.agents.has(npc_id):
		return Vector2.INF
	var a: Dictionary=core.state.agents[npc_id]
	var action: Dictionary=a.action
	if action.get("type","")=="travel":
		var elapsed=int(action.elapsed)
		for leg in action.legs:
			if elapsed<=int(leg.minutes):
				if not anchors.has(leg.from) or not anchors.has(leg.to):
					return Vector2.INF
				return Vector2(anchors[leg.from]).lerp(Vector2(anchors[leg.to]),float(elapsed)/float(leg.minutes))
			elapsed-=int(leg.minutes)
	return Vector2(anchors[a.place]) if anchors.has(a.place) else Vector2.INF
