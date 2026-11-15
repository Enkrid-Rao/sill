# Sill 外部点击监视器
#
# 面板不抢焦点，所以无法用 BrowserWindow 的 blur 判断“点了外面”。
# 这里用 GetAsyncKeyState 轮询左键，只在按下的那一帧输出一行 "click"；
# 主进程用 Electron 的 screen.getCursorScreenPoint()（DIP 坐标）判断位置，
# 不把 PowerShell 的物理像素坐标混进多屏 / 高 DPI 的判断里。
#
# 设计约束：
# - 只用 user32 的 GetAsyncKeyState，不安装全局钩子；
# - 40ms 轮询，不阻塞、不消费点击；
# - 面板隐藏时主进程会 kill 这个进程，不在后台常驻。

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class SillMouseWatch {
    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);
}
"@

$VK_LBUTTON = 0x01
$wasDown = $false

while ($true) {
    $down = ([SillMouseWatch]::GetAsyncKeyState($VK_LBUTTON) -band 0x8000) -ne 0

    if ($down -and -not $wasDown) {
        [Console]::Out.WriteLine("click")
        [Console]::Out.Flush()
    }

    $wasDown = $down
    Start-Sleep -Milliseconds 40
}
