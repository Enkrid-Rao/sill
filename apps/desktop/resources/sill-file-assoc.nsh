; 当前用户级 .sill 关联。安装版自动注册，卸载时只清掉属于 Sill 的项。
; 绿色版不写注册表，由设置 → 组件里的按钮显式注册。

!macro customInstall
  WriteRegStr HKCU "Software\Classes\.sill" "" "Sill.WidgetPackage"
  WriteRegStr HKCU "Software\Classes\.sill\OpenWithProgids" "Sill.WidgetPackage" ""
  WriteRegStr HKCU "Software\Classes\Sill.WidgetPackage" "" "Sill component package"
  WriteRegStr HKCU "Software\Classes\Sill.WidgetPackage\DefaultIcon" "" '"$INSTDIR\Sill.exe,0"'
  WriteRegStr HKCU "Software\Classes\Sill.WidgetPackage\shell" "" "open"
  WriteRegStr HKCU "Software\Classes\Sill.WidgetPackage\shell\open" "" "Install with Sill"
  WriteRegStr HKCU "Software\Classes\Sill.WidgetPackage\shell\open\command" "" '"$INSTDIR\Sill.exe" "%1"'
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x1000, i 0, i 0)'
!macroend

!macro customUnInstall
  ReadRegStr $0 HKCU "Software\Classes\.sill" ""
  StrCmp $0 "Sill.WidgetPackage" 0 sill_keep_ext
    DeleteRegKey HKCU "Software\Classes\.sill"
    Goto sill_prog_done
  sill_keep_ext:
    DeleteRegValue HKCU "Software\Classes\.sill\OpenWithProgids" "Sill.WidgetPackage"
  sill_prog_done:
  DeleteRegKey HKCU "Software\Classes\Sill.WidgetPackage"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x1000, i 0, i 0)'
!macroend
