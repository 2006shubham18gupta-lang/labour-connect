Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """index.html""", 1, False

Set objIE = CreateObject("InternetExplorer.Application")
objIE.Visible = True
objIE.ToolBar = False
objIE.MenuBar = False
objIE.AddressBar = False
objIE.StatusBar = False
objIE.Resizable = True
objIE.Navigate WshShell.CurrentDirectory & "\index.html"

Do While objIE.Busy
    WScript.Sleep 100
Loop

objIE.Document.ParentWindow.History.PushState Null, "", "/"

WshShell.AppActivate "Labour Connect"