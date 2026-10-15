$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {
  $inputJob = [Console]::In.ReadToEnd() | ConvertFrom-Json
  Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class ProntoRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public class DocInfo { public string name; public string output; public string type; }
  [DllImport("winspool.drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
  static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
  static extern uint StartDocPrinter(IntPtr handle, uint level, [In] DocInfo info);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool WritePrinter(IntPtr handle, IntPtr bytes, int count, out int written);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool AbortPrinter(IntPtr handle);
  public static bool uncertain = false;
  static void Check(bool ok) { if(!ok) throw new Win32Exception(Marshal.GetLastWin32Error()); }
  public static uint Send(string name, byte[] bytes) {
    IntPtr printer=IntPtr.Zero, memory=IntPtr.Zero; bool started=false;
    try {
      Check(OpenPrinter(name,out printer,IntPtr.Zero));
      uint job=StartDocPrinter(printer,1,new DocInfo {name="Pronto - comanda ESC/POS",output=null,type="RAW"});
      if(job==0) throw new Win32Exception(Marshal.GetLastWin32Error());
      started=true; Check(StartPagePrinter(printer));
      memory=Marshal.AllocHGlobal(bytes.Length); Marshal.Copy(bytes,0,memory,bytes.Length);
      int offset=0;
      while(offset<bytes.Length) {
        int written;
        uncertain=true;
        Check(WritePrinter(printer,IntPtr.Add(memory,offset),Math.Min(32768,bytes.Length-offset),out written));
        if(written<=0) throw new Exception("A fila nao aceitou todos os bytes da comanda.");
        offset+=written;
      }
      Check(EndPagePrinter(printer)); Check(EndDocPrinter(printer)); started=false;
      return job;
    } finally {
      if(started && printer!=IntPtr.Zero) AbortPrinter(printer);
      if(memory!=IntPtr.Zero) Marshal.FreeHGlobal(memory);
      if(printer!=IntPtr.Zero) ClosePrinter(printer);
    }
  }
}
'@
  $bytes = [Convert]::FromBase64String($inputJob.data)
  if ($bytes.Length -eq 0 -or $bytes.Length -gt 1048576) { throw 'Tamanho de comanda invalido.' }
  $jobId = [ProntoRawPrinter]::Send([string]$inputJob.printer, $bytes)
  @{ok=$true;jobId=$jobId;bytes=$bytes.Length} | ConvertTo-Json -Compress
} catch {
  $uncertain = $false
  if ('ProntoRawPrinter' -as [type]) { $uncertain = [ProntoRawPrinter]::uncertain }
  @{ok=$false;uncertain=$uncertain;error=$_.Exception.Message} | ConvertTo-Json -Compress
  exit 1
}
