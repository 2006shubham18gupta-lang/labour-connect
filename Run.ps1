$ie = New-Object -ComObject InternetExplorer.Application
$ie.Visible = $true
$ie.ToolBar = $false
$ie.MenuBar = $false
$ie.AddressBar = $false
$ie.StatusBar = $false
$ie.Width = 1200
$ie.Height = 800
$ie.Left = 100
$ie.Top = 100
$ie.Navigate($PSScriptRoot + "\index.html")
$ie.Document.ParentWindow.History.PushState($null, $null, "/")

while ($ie.Busy -or $ie.ReadyState -ne 4) { 
    Start-Sleep -Milliseconds 100 
}

$ie