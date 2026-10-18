extends Node
const Core=preload("res://world_core.gd")
var core=Core.new()
var callback: JavaScriptObject
func _ready() -> void:
	if not OS.has_feature("web"):
		return
	callback=JavaScriptBridge.create_callback(_receive)
	JavaScriptBridge.get_interface("window").farlands_install(callback)
func _receive(args: Array) -> void:
	var message: Dictionary=JSON.parse_string(str(args[0]))
	var result: Dictionary={}
	match message.action:
		"start": result=core.start(message.definition,message.contentHash)
		"advance": result=core.advance(int(message.minutes))
		"restore":
			if core.restore(message.report):
				result=core.snapshot()
		"snapshot": result=core.snapshot()
	var response={"channel":"farlands-core","requestId":message.requestId,"report":result,"error":core.error}
	JavaScriptBridge.get_interface("window").farlands_send(JSON.stringify(response))
