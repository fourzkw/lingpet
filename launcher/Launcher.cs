using System;
using System.IO;
using System.Diagnostics;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Text.RegularExpressions;
using System.Windows.Forms;
using System.Threading.Tasks;
using System.Threading;
using System.Text;

internal static class Launcher {
  internal static string Quote(string value) {
    // CommandLineToArgvW quoting, including trailing slashes and embedded quotes.
    return "\"" + Regex.Replace(value, "(\\\\*)\"", "$1$1\\\"").TrimEnd('\\') +
      new string('\\', value.Length - value.TrimEnd('\\').Length) + new string('\\', value.Length - value.TrimEnd('\\').Length) + "\"";
  }
  [STAThread] static int Main(string[] args) {
    string mode = Path.GetFileNameWithoutExtension(Application.ExecutablePath);
    try {
      if(args.Length==2 && args[0]=="--uninstall-root")return Uninstall(args[1]);
      if(args.Length==3 && args[0]=="--move-data")return MoveStorage(args[1],args[2]);
      if(mode=="LingPetMaintenance"){
        bool moving=args.Length==2&&args[0]=="--move-data";
        string installRoot=Path.GetDirectoryName(Application.ExecutablePath);
        string helperDirectory=Path.Combine(moving?installRoot:DataDirectory(),"maintenance");Directory.CreateDirectory(helperDirectory);
        string helper=Path.Combine(helperDirectory,"LingPetMaintenance-"+Guid.NewGuid().ToString("N")+".exe");
        File.Copy(Application.ExecutablePath,helper);
        var launch=new ProcessStartInfo(helper,moving?"--move-data "+Quote(installRoot)+" "+Quote(args[1]):"--uninstall-root "+Quote(installRoot));
        launch.UseShellExecute=false;launch.CreateNoWindow=true;launch.WorkingDirectory=helperDirectory;
        launch.EnvironmentVariables["BOARD_PET_DATA_DIR"]=DataDirectory();
        launch.EnvironmentVariables["LINGPET_INSTALL_ROOT"]=installRoot;
        using(var process=Process.Start(launch)){}return 0;
      }
      string root = Path.GetDirectoryName(Application.ExecutablePath);
      var state = new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(root,"active.json")));
      string version = Convert.ToString(state["active"]);
      if (!Regex.IsMatch(version, @"^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$")) throw new Exception("Invalid installed version");
      string release = Path.Combine(root,"versions",version), app = Path.Combine(release,"resources","app");
      bool bridge = mode == "LingPetBridge", maintenance = mode == "LingPetMaintenance";
      var command = new List<string>();
      if (bridge) {
        if (args.Length < 2 || !(args[0] == "hook" || args[0] == "mcp") || !Regex.IsMatch(args[1], @"^[a-f0-9-]{36}$")) throw new Exception("Invalid bridge command");
        command.Add(Path.Combine(app,"bin","desktop-bridge.js"));command.AddRange(args);
      } else if (maintenance) {
        command.Add(Path.Combine(app,"bin","desktop-maintenance.js"));command.Add("--uninstall");
      } else {
        command.Add(app);
        foreach (string arg in args) if (arg == "--dashboard" || arg == "--login" || arg == "--no-sandbox" || arg == "--disable-gpu") command.Add(arg);
      }
      var start = new ProcessStartInfo(Path.Combine(release,bridge || maintenance ? "node.exe" : "electron.exe"));
      start.UseShellExecute=false;start.CreateNoWindow=true;start.WorkingDirectory=root;
      start.EnvironmentVariables.Remove("NODE_OPTIONS");start.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
      start.EnvironmentVariables["LINGPET_INSTALL_ROOT"]=root;
      start.EnvironmentVariables["BOARD_PET_DATA_DIR"]=DataDirectory();
      if(bridge){start.RedirectStandardInput=true;start.RedirectStandardOutput=true;start.RedirectStandardError=true;}
      if(maintenance){start.RedirectStandardError=true;start.StandardErrorEncoding=Encoding.UTF8;}
      start.Arguments=String.Join(" ",command.ConvertAll(Quote).ToArray());
      using(var process=Process.Start(start)) {
        if(bridge){
          var input=Task.Run(async()=>{try{await Console.OpenStandardInput().CopyToAsync(process.StandardInput.BaseStream);}catch{}finally{try{process.StandardInput.Close();}catch{}}});
          var output=process.StandardOutput.BaseStream.CopyToAsync(Console.OpenStandardOutput());
          var errors=process.StandardError.BaseStream.CopyToAsync(Console.OpenStandardError());
          process.WaitForExit();Task.WaitAll(output,errors);return process.ExitCode;
        }
        if (maintenance) { var errors=process.StandardError.ReadToEndAsync();process.WaitForExit();if(process.ExitCode!=0){errors.Wait(1000);string error=errors.IsCompleted?errors.Result:"请检查维护日志后重试。";Console.Error.WriteLine(error);MessageBox.Show(error,"灵伴卸载未完成",MessageBoxButtons.OK,MessageBoxIcon.Error);}return process.ExitCode; }
      }
      return 0;
    } catch(Exception error) {
      if (mode == "LingPetBridge") {
        // Empty output is neutral for all hooks except Cursor's beforeSubmitPrompt.
        if (args.Length > 2 && args[2] == "beforeSubmitPrompt") Console.WriteLine("{\"continue\":true}");
        return args.Length > 0 && args[0] == "hook" ? 0 : 1;
      }
      try{Directory.CreateDirectory(DataDirectory());File.AppendAllText(Path.Combine(DataDirectory(),"maintenance-error.log"),error.ToString()+Environment.NewLine);}catch{}
      if(Environment.GetEnvironmentVariable("LINGPET_MAINTENANCE_TEST")!="1")MessageBox.Show(error.Message,"灵伴启动失败",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;
    }
  }
  static string DataDirectory(){
    string data=Environment.GetEnvironmentVariable("BOARD_PET_DATA_DIR");if(!String.IsNullOrEmpty(data))return Path.GetFullPath(data);
    string root=Environment.GetEnvironmentVariable("LINGPET_INSTALL_ROOT")??Path.GetDirectoryName(Application.ExecutablePath),file=Path.Combine(root,"desktop-location.json");
    if(File.Exists(file)){var record=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(file));object value;if(!record.TryGetValue("dataDir",out value)||!(value is string)||!Path.IsPathRooted((string)value))throw new Exception("Invalid data directory");return Path.GetFullPath((string)value);}
    return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"BoardAiPet");
  }
  static int MoveStorage(string directory,string target){
    string root=Path.GetFullPath(directory);
    var state=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(root,"active.json")));
    string version=Convert.ToString(state["active"]);if(!Regex.IsMatch(version,@"^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$"))throw new Exception("Invalid installed version");
    string release=Path.Combine(root,"versions",version),script=Path.Combine(release,"resources","app","bin","desktop-relocate.js");
    var start=new ProcessStartInfo(Path.Combine(release,"node.exe"),Quote(script)+" "+Quote(target));
    start.UseShellExecute=false;start.CreateNoWindow=true;start.WorkingDirectory=root;start.RedirectStandardError=true;start.StandardErrorEncoding=Encoding.UTF8;
    start.EnvironmentVariables.Remove("NODE_OPTIONS");start.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
    start.EnvironmentVariables["LINGPET_INSTALL_ROOT"]=root;start.EnvironmentVariables["BOARD_PET_DATA_DIR"]=DataDirectory();
    Form progress=null;
    if(Environment.GetEnvironmentVariable("LINGPET_MAINTENANCE_TEST")!="1"){
      progress=new Form();progress.Text="正在迁移灵伴内容";progress.Width=450;progress.Height=145;progress.ControlBox=false;progress.StartPosition=FormStartPosition.CenterScreen;
      var label=new Label();label.Text="正在复制数据并保留原内容备份，完成后会重新打开灵伴。";label.Left=20;label.Top=20;label.Width=400;label.Height=40;
      var bar=new ProgressBar();bar.Left=20;bar.Top=65;bar.Width=395;bar.Style=ProgressBarStyle.Marquee;progress.Controls.Add(label);progress.Controls.Add(bar);progress.Show();
    }
    try{using(var process=Process.Start(start)){var errors=process.StandardError.ReadToEndAsync();while(!process.WaitForExit(100)){if(progress!=null)Application.DoEvents();}if(process.ExitCode!=0)throw new Exception(errors.Result);}}
    finally{if(progress!=null)progress.Close();}
    var reopen=new ProcessStartInfo(Path.Combine(root,"LingPet.exe"),"--dashboard"+(Environment.GetEnvironmentVariable("LINGPET_MAINTENANCE_TEST_NO_SANDBOX")=="1"?" --no-sandbox --disable-gpu":""));reopen.UseShellExecute=false;reopen.WorkingDirectory=root;reopen.CreateNoWindow=true;reopen.EnvironmentVariables["BOARD_PET_DATA_DIR"]=DataDirectory();using(var process=Process.Start(reopen)){}return 0;
  }
  static int Uninstall(string directory){
    string root=Path.GetFullPath(directory);
    if(root.TrimEnd('\\')==Path.GetPathRoot(root).TrimEnd('\\')||String.Equals(root.TrimEnd('\\'),Path.GetFullPath(DataDirectory()).TrimEnd('\\'),StringComparison.OrdinalIgnoreCase))throw new Exception("Invalid installation directory");
    var state=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(root,"active.json")));
    string version=Convert.ToString(state["active"]);
    if(!Regex.IsMatch(version,@"^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$"))throw new Exception("Invalid installed version");
    string release=Path.Combine(root,"versions",version),app=Path.Combine(release,"resources","app");
    var start=new ProcessStartInfo(Path.Combine(release,"node.exe"),Quote(Path.Combine(app,"bin","desktop-maintenance.js"))+" --uninstall");
    start.UseShellExecute=false;start.CreateNoWindow=true;start.WorkingDirectory=DataDirectory();start.RedirectStandardError=true;start.StandardErrorEncoding=Encoding.UTF8;
    start.EnvironmentVariables.Remove("NODE_OPTIONS");start.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
    start.EnvironmentVariables["LINGPET_INSTALL_ROOT"]=root;
    start.EnvironmentVariables["BOARD_PET_DATA_DIR"]=DataDirectory();
    start.EnvironmentVariables["LINGPET_MAINTENANCE_HELPER"]="1";
    using(var process=Process.Start(start)){var errors=process.StandardError.ReadToEndAsync();process.WaitForExit();if(process.ExitCode!=0)throw new Exception(errors.Result);}
    string data=DataDirectory();
    string log=Path.Combine(data,"uninstall.log");
    for(int attempt=0;;attempt++){
      try{
        // Data may be inside the install root. Remove only owned program paths,
        // never the root recursively, so downloads and unknown files survive.
        foreach(string name in new[]{"versions","maintenance"}){string folder=Path.Combine(root,name);if(Directory.Exists(folder))Directory.Delete(folder,true);}
        foreach(string name in new[]{"LingPet.exe","LingPetBridge.exe","LingPetMaintenance.exe","active.json","desktop-location.json","storage-move-result.json"})File.Delete(Path.Combine(root,name));
        if(Directory.Exists(root)&&Directory.GetFileSystemEntries(root).Length==0)Directory.Delete(root,false);
        File.AppendAllText(log,"Cleanup complete; data preserved: "+data+Environment.NewLine);return 0;
      }
      catch(Exception error){if(attempt>=30){File.AppendAllText(log,error.Message+Environment.NewLine);throw;}Thread.Sleep(500);}
    }
  }
}
