extends Node2D
## Отладочное ближнее представление: отображает одно состояние TravelInstance.
## Не управляет деньгами, временем, планами и не заменяет NavigationAgent боевого NPC.
@export var npc_id: String=""
@export var anchors: Dictionary={}
@export var show_debug_marker:=true
func _physics_process(_delta: float) -> void:
	var service=get_node_or_null("/root/WorldSimulation")
	if service==null:
		return
	var point: Vector2=service.position_for(npc_id,anchors)
	if point!=Vector2.INF:
		global_position=point
func _draw() -> void:
	if show_debug_marker:
		draw_circle(Vector2.ZERO,8,Color("e7b85e"))
