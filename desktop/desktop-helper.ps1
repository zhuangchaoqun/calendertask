param(
    [Parameter(Mandatory = $true)][long]$Handle,
    [ValidateSet('attach', 'detach')][string]$Mode = 'attach'
)

$source = @'
using System;
using System.Runtime.InteropServices;

public static class BEIODesktopHost
{
    private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr FindWindow(string className, string windowName);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string className, string windowName);
    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
    [DllImport("user32.dll")]
    private static extern IntPtr SetParent(IntPtr child, IntPtr parent);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(IntPtr hwnd, IntPtr insertAfter, int x, int y, int cx, int cy, uint flags);

    private const uint SMTO_NORMAL = 0;
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_NOACTIVATE = 0x0010;
    private const uint SWP_FRAMECHANGED = 0x0020;

    public static void Attach(long rawHandle)
    {
        IntPtr child = new IntPtr(rawHandle);
        IntPtr progman = FindWindow("Progman", null);
        IntPtr result;
        SendMessageTimeout(progman, 0x052C, IntPtr.Zero, IntPtr.Zero, SMTO_NORMAL, 1000, out result);

        IntPtr worker = IntPtr.Zero;
        EnumWindows(delegate(IntPtr top, IntPtr state) {
            IntPtr shellView = FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null);
            if (shellView != IntPtr.Zero) {
                worker = FindWindowEx(IntPtr.Zero, top, "WorkerW", null);
                return false;
            }
            return true;
        }, IntPtr.Zero);

        SetParent(child, worker != IntPtr.Zero ? worker : progman);
        SetWindowPos(child, new IntPtr(1), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED);
    }

    public static void Detach(long rawHandle)
    {
        IntPtr child = new IntPtr(rawHandle);
        SetParent(child, IntPtr.Zero);
        SetWindowPos(child, IntPtr.Zero, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED);
    }
}
'@

Add-Type -TypeDefinition $source
if ($Mode -eq 'attach') { [BEIODesktopHost]::Attach($Handle) }
else { [BEIODesktopHost]::Detach($Handle) }
