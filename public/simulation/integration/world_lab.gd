extends Node2D
## Условный стенд, не окончательная планировка города и не production-арт.
var service: Node
var anchors: Dictionary={}
func _ready() -> void:
	service=get_node_or_null("/root/WorldSimulation")
	if service==null:
		service=load("res://addons/farlands_world/world_service.gd").new()
		service.name="WorldSimulation"
		get_tree().root.add_child.call_deferred(service)
	await get_tree().process_frame
	if service.active:
		for place in service.core.definition.places:
			anchors[place.id]=Vector2(float(place.x)*0.8,float(place.y)*0.45)+Vector2(60,35)
func _process(_delta: float) -> void:
	queue_redraw()
func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.keycode==KEY_SPACE:
		var clock=get_node_or_null("/root/GameClock")
		if clock:
			clock.set_paused(not clock.is_paused())
func _draw() -> void:
	if service==null or not service.active:
		return
	var world: Dictionary=service.core.definition
	for route in world.routes:
		if anchors.has(route.from) and anchors.has(route.to):
			draw_line(anchors[route.from],anchors[route.to],Color("7a755f") if route.open else Color("663f3f"),2)
	var font=ThemeDB.fallback_font
	for place in world.places:
		if anchors.has(place.id):
			draw_circle(anchors[place.id],4,Color("a9b49c"))
			draw_string(font,anchors[place.id]+Vector2(7,-8),place.name,HORIZONTAL_ALIGNMENT_LEFT,-1,11,Color("c9c3b0"))
	for npc in world.agents:
		var p: Vector2=service.position_for(npc.id,anchors)
		if p!=Vector2.INF:
			draw_circle(p,7,Color("ebbc65"))
			draw_string(font,p+Vector2(9,12),npc.name,HORIZONTAL_ALIGNMENT_LEFT,-1,12)
	draw_string(font,Vector2(20,22),"Лаборатория мира · минута "+str(service.core.state.minute)+" · SPACE: пауза",HORIZONTAL_ALIGNMENT_LEFT,-1,15)
