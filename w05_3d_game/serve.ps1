# Serves this folder at http://127.0.0.1 so the browser can load the game.
# Windows PowerShell 5.1 is enough. Node.js is not required.
param(
  [int]$Port = 0,
  [switch]$Open
)

$ErrorActionPreference = 'Continue'

if ($Port -le 0) {
  if ($env:PORT -match '^\d+$') { $Port = [int]$env:PORT }
  else { $Port = 5173 }
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

try { & cmd.exe /c 'chcp 65001>nul' } catch {}
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false } catch {}

$source = @'
using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace WrongFloor
{
  public static class LocalServer
  {
    public static void Run(string root, int port, bool open)
    {
      string url = "http://127.0.0.1:" + port + "/";
      TcpListener listener = new TcpListener(IPAddress.Loopback, port);
      try
      {
        listener.Start();
      }
      catch (SocketException ex)
      {
        if (ex.SocketErrorCode == SocketError.AddressAlreadyInUse)
        {
          Console.WriteLine("\u7aef\u53e3 " + port + " \u5df2\u7ecf\u6709\u670d\u52a1\u5728\u8dd1\uff0c\u76f4\u63a5\u6253\u5f00 " + url);
          if (open) OpenBrowser(url);
          return;
        }
        throw;
      }

      Console.WriteLine("\u9519\u5c42 Wrong Floor  " + url);
      Console.WriteLine("\u672c\u7a97\u53e3\u7528 Windows \u81ea\u5e26\u529f\u80fd\u6253\u5f00\u6e38\u620f\uff0c\u4e0d\u9700\u8981\u5b89\u88c5 Node.js\u3002");
      Console.WriteLine("\u5173\u6389\u8fd9\u4e2a\u7a97\u53e3\u5c31\u4f1a\u505c\u6b62\u6e38\u620f\u670d\u52a1\u5668\u3002");
      if (open) OpenBrowser(url);

      try
      {
        while (true)
        {
          TcpClient client = listener.AcceptTcpClient();
          ThreadPool.QueueUserWorkItem(new WaitCallback(Handle), new object[] { client, root });
        }
      }
      finally
      {
        try { listener.Stop(); } catch (Exception) { }
      }
    }

    static void Handle(object state)
    {
      object[] box = (object[])state;
      TcpClient client = (TcpClient)box[0];
      string root = (string)box[1];
      try
      {
        client.NoDelay = true;
        client.ReceiveTimeout = 8000;
        client.SendTimeout = 60000;
        using (NetworkStream stream = client.GetStream())
        {
          Serve(stream, root);
        }
      }
      catch (Exception)
      {
      }
      finally
      {
        try { client.Close(); } catch (Exception) { }
      }
    }

    static void Serve(NetworkStream stream, string root)
    {
      string head = ReadHead(stream);
      if (head == null || head.Length == 0) return;
      string[] lines = head.Split(new string[] { "\r\n" }, StringSplitOptions.None);
      if (lines.Length == 0) return;
      string[] parts = lines[0].Split(' ');
      if (parts.Length < 2)
      {
        WriteAscii(stream, Status(400, "Bad Request"));
        return;
      }

      string method = parts[0].ToUpperInvariant();
      if (method != "GET" && method != "HEAD")
      {
        WriteAscii(stream, Status(405, "Method Not Allowed"));
        return;
      }

      int code;
      string file = MapPath(root, parts[1], out code);
      if (file == null)
      {
        if (code != 400 && code != 403 && code != 404) code = 404;
        string msg = code == 403 ? "Forbidden" : (code == 400 ? "Bad Request" : "Not found");
        WriteAscii(stream, Status(code, msg));
        return;
      }

      SendFile(stream, file, method, Header(lines, "Range"));
    }

    static string MapPath(string root, string urlPath, out int code)
    {
      code = 404;
      try
      {
        string path = urlPath;
        int q = path.IndexOf('?');
        if (q >= 0) path = path.Substring(0, q);
        int hash = path.IndexOf('#');
        if (hash >= 0) path = path.Substring(0, hash);
        path = Uri.UnescapeDataString(path);
        path = path.Replace('/', Path.DirectorySeparatorChar);
        while (path.Length > 0 && path[0] == Path.DirectorySeparatorChar) path = path.Substring(1);
        if (path.Length == 0) path = "index.html";
        if (path.IndexOf(':') >= 0) { code = 403; return null; }

        string rootFull = Path.GetFullPath(root);
        char sep = Path.DirectorySeparatorChar;
        if (rootFull[rootFull.Length - 1] != sep) rootFull = rootFull + sep;
        string full = Path.GetFullPath(Path.Combine(rootFull, path));
        if (!full.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase)) { code = 403; return null; }
        if (Directory.Exists(full)) full = Path.Combine(full, "index.html");
        if (!File.Exists(full)) { code = 404; return null; }
        code = 200;
        return full;
      }
      catch (Exception)
      {
        code = 400;
        return null;
      }
    }

    static void SendFile(NetworkStream stream, string file, string method, string rangeHeader)
    {
      long total = new FileInfo(file).Length;
      long start = 0;
      long end = total > 0 ? total - 1 : 0;
      bool partial = false;

      if (!string.IsNullOrEmpty(rangeHeader))
      {
        if (!TryRange(rangeHeader, total, out start, out end))
        {
          WriteAscii(stream, "HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */" + total + "\r\nContent-Length: 0\r\nAccept-Ranges: bytes\r\nConnection: close\r\n\r\n");
          return;
        }
        partial = true;
      }

      long length = total == 0 ? 0 : (end - start + 1);
      StringBuilder sb = new StringBuilder();
      sb.Append(partial ? "HTTP/1.1 206 Partial Content\r\n" : "HTTP/1.1 200 OK\r\n");
      sb.Append("Content-Type: ").Append(Mime(Path.GetExtension(file))).Append("\r\n");
      sb.Append("Content-Length: ").Append(length).Append("\r\n");
      sb.Append("Accept-Ranges: bytes\r\n");
      sb.Append("Cache-Control: no-cache\r\n");
      sb.Append("Connection: close\r\n");
      if (partial)
      {
        sb.Append("Content-Range: bytes ").Append(start).Append("-").Append(end).Append("/").Append(total).Append("\r\n");
      }
      sb.Append("\r\n");
      WriteAscii(stream, sb.ToString());
      if (method == "HEAD" || length == 0) return;

      using (FileStream fs = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
      {
        fs.Seek(start, SeekOrigin.Begin);
        byte[] buf = new byte[65536];
        long left = length;
        while (left > 0)
        {
          int want = left > buf.Length ? buf.Length : (int)left;
          int n = fs.Read(buf, 0, want);
          if (n <= 0) break;
          stream.Write(buf, 0, n);
          left -= n;
        }
      }
    }

    static bool TryRange(string header, long total, out long start, out long end)
    {
      start = 0;
      end = 0;
      header = header.Trim();
      if (!header.StartsWith("bytes=", StringComparison.OrdinalIgnoreCase)) return false;
      string spec = header.Substring("bytes=".Length);
      if (spec.IndexOf(',') >= 0) return false;
      int dash = spec.IndexOf('-');
      if (dash < 0) return false;
      string a = spec.Substring(0, dash);
      string b = spec.Substring(dash + 1);
      if (a.Length == 0 && b.Length == 0) return false;
      if (total <= 0) return false;

      if (a.Length == 0)
      {
        long suffix;
        if (!long.TryParse(b, out suffix) || suffix <= 0) return false;
        start = suffix >= total ? 0 : total - suffix;
        end = total - 1;
      }
      else
      {
        if (!long.TryParse(a, out start)) return false;
        if (b.Length == 0) end = total - 1;
        else if (!long.TryParse(b, out end)) return false;
        if (end > total - 1) end = total - 1;
      }

      return start >= 0 && end >= start && start < total;
    }

    static string Header(string[] lines, string name)
    {
      string prefix = name + ":";
      for (int i = 1; i < lines.Length; i++)
      {
        if (lines[i].StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
          return lines[i].Substring(prefix.Length).Trim();
        }
      }
      return null;
    }

    static string ReadHead(NetworkStream stream)
    {
      MemoryStream ms = new MemoryStream();
      byte[] buf = new byte[4096];
      while (ms.Length < 65536)
      {
        int n = stream.Read(buf, 0, buf.Length);
        if (n <= 0) break;
        ms.Write(buf, 0, n);
        byte[] all = ms.ToArray();
        for (int i = 0; i + 3 < all.Length; i++)
        {
          if (all[i] == 13 && all[i + 1] == 10 && all[i + 2] == 13 && all[i + 3] == 10)
          {
            return Encoding.ASCII.GetString(all, 0, i);
          }
        }
      }
      return null;
    }

    static string Mime(string ext)
    {
      if (ext == null) return "application/octet-stream";
      switch (ext.ToLowerInvariant())
      {
        case ".html": return "text/html; charset=utf-8";
        case ".js": return "text/javascript; charset=utf-8";
        case ".css": return "text/css; charset=utf-8";
        case ".json": return "application/json";
        case ".svg": return "image/svg+xml";
        case ".png": return "image/png";
        case ".jpg":
        case ".jpeg": return "image/jpeg";
        case ".glb": return "model/gltf-binary";
        case ".mp3": return "audio/mpeg";
        case ".ogg": return "audio/ogg";
        case ".mp4": return "video/mp4";
        case ".wav": return "audio/wav";
        case ".ico": return "image/x-icon";
        default: return "application/octet-stream";
      }
    }

    static string Status(int code, string text)
    {
      return "HTTP/1.1 " + code + " " + Reason(code) + "\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: " + text.Length + "\r\nConnection: close\r\n\r\n" + text;
    }

    static string Reason(int code)
    {
      if (code == 200) return "OK";
      if (code == 400) return "Bad Request";
      if (code == 403) return "Forbidden";
      if (code == 404) return "Not Found";
      if (code == 405) return "Method Not Allowed";
      if (code == 416) return "Range Not Satisfiable";
      return "Error";
    }

    static void WriteAscii(NetworkStream stream, string text)
    {
      byte[] bytes = Encoding.ASCII.GetBytes(text);
      stream.Write(bytes, 0, bytes.Length);
    }

    static void OpenBrowser(string url)
    {
      try
      {
        ProcessStartInfo psi = new ProcessStartInfo();
        psi.FileName = url;
        psi.UseShellExecute = true;
        Process.Start(psi);
      }
      catch (Exception)
      {
        try
        {
          ProcessStartInfo psi = new ProcessStartInfo();
          psi.FileName = "cmd.exe";
          psi.Arguments = "/c start \"\" \"" + url + "\"";
          psi.UseShellExecute = false;
          psi.CreateNoWindow = true;
          Process.Start(psi);
        }
        catch (Exception) { }
      }
    }
  }
}
'@

Add-Type -TypeDefinition $source -ReferencedAssemblies System.dll
if (-not ('WrongFloor.LocalServer' -as [type])) {
  Write-Host 'The built-in server could not start.'
  Write-Host 'Install Node.js 18 or newer from https://nodejs.org and run start.bat again.'
  exit 1
}

[WrongFloor.LocalServer]::Run($root, $Port, [bool]$Open)
