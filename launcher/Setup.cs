using System;
using System.IO;
using System.IO.Compression;
using System.Diagnostics;
using System.Reflection;
using System.Windows.Forms;
using System.Drawing;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Text;

internal static class Setup {
  [STAThread] static int Main(string[] args) {
    bool silent=Array.IndexOf(args,"--silent")>=0;
    string root=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","LingPet");
    string data=null,temp=Path.Combine(Path.GetTempPath(),"lingpet-setup-"+Guid.NewGuid().ToString("N"));
    try {
      Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
      bool explicitRoot=false;
      for(int i=0;i+1<args.Length;i++){if(args[i]=="--root"){root=Path.GetFullPath(args[i+1]);explicitRoot=true;}if(args[i]=="--data")data=Path.GetFullPath(args[i+1]);}
      ExistingLocations(ref root,ref data,explicitRoot);
      if(!silent){var selected=ChooseLocations(root,data);if(selected==null)return 0;root=selected[0];data=selected[1];}
      Form progress=null;Label label=null;
      if(!silent){progress=new Form();progress.Text="正在安装灵伴";progress.Width=430;progress.Height=140;progress.ControlBox=false;progress.StartPosition=FormStartPosition.CenterScreen;label=new Label();label.Left=20;label.Top=20;label.Width=380;label.Text="正在解压本体与运行环境，请稍候…";var bar=new ProgressBar();bar.Left=20;bar.Top=55;bar.Width=375;bar.Style=ProgressBarStyle.Marquee;progress.Controls.Add(label);progress.Controls.Add(bar);progress.Show();Application.DoEvents();}
      Directory.CreateDirectory(temp);
      using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))
      using(var zip=new ZipArchive(stream,ZipArchiveMode.Read))foreach(var entry in zip.Entries){
        string target=Path.GetFullPath(Path.Combine(temp,entry.FullName));
        if(!target.StartsWith(temp+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Exception("Invalid package path");
        if(entry.FullName.EndsWith("/")){Directory.CreateDirectory(target);continue;}
        Directory.CreateDirectory(Path.GetDirectoryName(target));using(var input=entry.Open())using(var output=File.Create(target))input.CopyTo(output);if(!silent)Application.DoEvents();
      }
      var start=new ProcessStartInfo(Path.Combine(temp,"node.exe"));start.UseShellExecute=false;start.CreateNoWindow=true;
      start.Arguments=LauncherQuote(Path.Combine(temp,"resources","app","bin","desktop-maintenance.js"))+" --payload "+LauncherQuote(temp)+" --root "+LauncherQuote(root)+(silent?" --no-shortcuts":"");
      if(Array.IndexOf(args,"--no-sandbox")>=0)start.Arguments+=" --test-no-sandbox";
      start.EnvironmentVariables.Remove("NODE_OPTIONS");start.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
      if(data!=null)start.EnvironmentVariables["BOARD_PET_DATA_DIR"]=data;
      start.RedirectStandardError=true;start.RedirectStandardOutput=true;
      start.StandardErrorEncoding=Encoding.UTF8;start.StandardOutputEncoding=Encoding.UTF8;
      if(label!=null){label.Text="正在校验，自动退出运行中的灵伴并安装…";Application.DoEvents();}
      using(var process=Process.Start(start)){var errors=process.StandardError.ReadToEndAsync();var output=process.StandardOutput.ReadToEndAsync();while(!process.WaitForExit(100)){if(!silent)Application.DoEvents();}output.Wait();if(progress!=null)progress.Close();if(process.ExitCode!=0)throw new Exception(String.IsNullOrWhiteSpace(errors.Result)?"安装进程异常退出，退出码："+process.ExitCode:errors.Result.Trim());}
      if(!silent){MessageBox.Show("安装完成。可在工作台的「Agent 接入」安装所需插件。","灵伴");Process.Start(Path.Combine(root,"LingPet.exe"),"--dashboard");}
      return 0;
    }catch(Exception error){string message=error.Message;try{string logs=Path.Combine(Path.GetTempPath(),"LingPet-Setup-Logs");Directory.CreateDirectory(logs);string log=Path.Combine(logs,"setup-"+Guid.NewGuid().ToString("N")+".log");File.WriteAllText(log,"安装目录："+root+Environment.NewLine+"数据目录："+data+Environment.NewLine+error.ToString(),new UTF8Encoding(false));message+=Environment.NewLine+Environment.NewLine+"详细日志："+log;}catch{}if(!silent)MessageBox.Show(message,"灵伴安装失败",MessageBoxButtons.OK,MessageBoxIcon.Error);else Console.Error.WriteLine(message);return 1;}
    finally{try{Directory.Delete(temp,true);}catch{}}
  }
  static void ExistingLocations(ref string root,ref string data,bool explicitRoot){
    string legacy=data??Environment.GetEnvironmentVariable("BOARD_PET_DATA_DIR")??Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"BoardAiPet");
    string record=Path.Combine(legacy,"desktop-install.json");
    if(!explicitRoot&&File.Exists(record)){
      var installed=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(record));
      object value;if(installed.TryGetValue("root",out value)&&value is string&&File.Exists(Path.Combine((string)value,"active.json"))){root=Path.GetFullPath((string)value);data=legacy;}
    }
    if(!explicitRoot&&data==null){using(var key=Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\LingPet")){if(key!=null){string registered=key.GetValue("InstallLocation") as string;if(registered!=null&&File.Exists(Path.Combine(registered,"active.json")))root=Path.GetFullPath(registered);}}}
    string location=Path.Combine(root,"desktop-location.json");
    if(data==null&&File.Exists(location)){var installed=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(location));object value;if(installed.TryGetValue("dataDir",out value)&&value is string)data=Path.GetFullPath((string)value);else throw new Exception("安装记录中的数据目录无效");}
    data=data??Path.Combine(root,"data");
  }
  static string[] ChooseLocations(string initial,string initialData){
    using(var dialog=new Form()){
      dialog.Text="安装灵伴";dialog.ClientSize=new Size(590,280);dialog.FormBorderStyle=FormBorderStyle.FixedDialog;
      dialog.MaximizeBox=false;dialog.MinimizeBox=false;dialog.StartPosition=FormStartPosition.CenterScreen;dialog.AutoScaleMode=AutoScaleMode.Font;
      var heading=new Label{Text="安装灵伴桌宠",Left=24,Top=22,Width=530,Height=34,Font=new Font("Microsoft YaHei UI",16,FontStyle.Bold)};
      var description=new Label{Text="本体已包含运行环境。Agent 插件可在安装后按需接入。",Left=26,Top=66,Width=540,Height=25};
      var caption=new Label{Text="安装目录",Left=26,Top=105,Width=510,Height=22};
      var location=new TextBox{Text=initial,Left=26,Top=133,Width=438,Height=28,AccessibleName="安装目录"};
      var browse=new Button{Text="浏览…",Left=478,Top=131,Width=86,Height=29};
      browse.Click+=(sender,e)=>{using(var picker=new FolderBrowserDialog{Description="选择安装位置，将在所选位置创建 LingPet 文件夹",SelectedPath=Directory.Exists(location.Text)?location.Text:Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),ShowNewFolderButton=true}){if(picker.ShowDialog(dialog)==DialogResult.OK)location.Text=String.Equals(Path.GetFileName(picker.SelectedPath),"LingPet",StringComparison.OrdinalIgnoreCase)?picker.SelectedPath:Path.Combine(picker.SelectedPath,"LingPet");}};
      var hint=new Label{Text="数据和下载内容默认保存到安装目录的 data 子文件夹，可在应用设置中修改。",Left=26,Top=177,Width=540,Height=40};
      var install=new Button{Text="安装",Left=380,Top=228,Width=86,Height=30};
      var cancel=new Button{Text="取消",Left=478,Top=228,Width=86,Height=30,DialogResult=DialogResult.Cancel};
      string[] selected=null;
      bool follow=String.Equals(Path.GetFullPath(initialData).TrimEnd('\\'),Path.Combine(initial,"data").TrimEnd('\\'),StringComparison.OrdinalIgnoreCase);
      install.Click+=(sender,e)=>{try{string selectedRoot=ValidateDirectory(location.Text);selected=new[]{selectedRoot,follow?Path.Combine(selectedRoot,"data"):initialData};dialog.DialogResult=DialogResult.OK;}catch(Exception error){MessageBox.Show(dialog,error.Message,"请检查安装位置",MessageBoxButtons.OK,MessageBoxIcon.Information);}};
      dialog.Controls.AddRange(new Control[]{heading,description,caption,location,browse,hint,install,cancel});dialog.AcceptButton=install;dialog.CancelButton=cancel;
      return dialog.ShowDialog()==DialogResult.OK?selected:null;
    }
  }
  static string ValidateDirectory(string value){if(String.IsNullOrWhiteSpace(value)||!Path.IsPathRooted(value))throw new Exception("请输入完整的文件夹路径，例如 D:\\Applications\\LingPet。");string selected=Path.GetFullPath(value.Trim());if(selected.TrimEnd('\\')==Path.GetPathRoot(selected).TrimEnd('\\'))throw new Exception("请选择独立文件夹，不能直接使用磁盘根目录。");return selected;}
  static string LauncherQuote(string value){if(value.Contains("\""))throw new Exception("Invalid path");return "\""+value.TrimEnd('\\')+"\"";}
}
