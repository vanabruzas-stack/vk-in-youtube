using System.Diagnostics;
using System.Drawing.Drawing2D;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;

namespace VkYouTubeSetup;

internal static class SetupBrand
{
#if REVERSE_EXTENSION
    internal const string Title = "YouTube";
    internal const string DestinationFolder = "VK Video in YouTube Style";
    internal const string RefreshTabs = "YouTube и YouTube Studio";
    internal const string FontName = "Arial";
    internal static readonly Color Accent = Color.FromArgb(255, 0, 51);
#else
    internal const string Title = "VK Видео для YouTube";
    internal const string DestinationFolder = "VK Video for YouTube";
    internal const string RefreshTabs = "YouTube";
    internal const string FontName = "VK Sans Display";
    internal static readonly Color Accent = Color.FromArgb(38, 136, 235);
#endif
}

internal sealed class BrowserChoice
{
    internal BrowserChoice(string name, string exe, string extensionsUrl)
    {
        Name = name;
        Exe = exe;
        ExtensionsUrl = extensionsUrl;
    }
    internal string Name { get; }
    internal string Exe { get; }
    internal string ExtensionsUrl { get; }
}

internal static class Program
{
    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    internal static bool OpenExtensionsPage(BrowserChoice choice)
    {
        var started = Process.Start(new ProcessStartInfo(choice.Exe) { UseShellExecute = true });
        Thread.Sleep(900);
        var processName = Path.GetFileNameWithoutExtension(choice.Exe);
        var browser = Process.GetProcessesByName(processName)
            .Where(process => process.MainWindowHandle != IntPtr.Zero)
            .OrderByDescending(process => process.StartTime)
            .FirstOrDefault() ?? started;
        if (browser is null || browser.MainWindowHandle == IntPtr.Zero || !SetForegroundWindow(browser.MainWindowHandle)) return false;
        Thread.Sleep(250);
        SendKeys.SendWait("^l");
        SendKeys.SendWait(choice.ExtensionsUrl);
        SendKeys.SendWait("{ENTER}");
        return true;
    }

    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Contains("--self-test"))
        {
            var valid = ExtensionFiles.Names.Contains("VKExtension.manifest.json");
            Console.WriteLine($"Extension files: {(valid ? "OK" : "MISSING")}");
            Console.WriteLine($"Detected browsers: {string.Join(", ", DiscoverBrowsers().Select(x => x.Name))}");
            return valid ? 0 : 1;
        }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new SetupForm(DiscoverBrowsers()));
        return 0;
    }

    private static List<BrowserChoice> DiscoverBrowsers()
    {
        var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        var programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        var candidates = new (string Name, string Url, string[] Paths)[]
        {
            ("Google Chrome", "chrome://extensions", [
                Path.Combine(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(local, "Google", "Chrome", "Application", "chrome.exe")]),
            ("Microsoft Edge", "edge://extensions", [
                Path.Combine(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(programFiles, "Microsoft", "Edge", "Application", "msedge.exe")]),
            ("Brave", "brave://extensions", [
                Path.Combine(programFiles, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
                Path.Combine(programFilesX86, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
                Path.Combine(local, "BraveSoftware", "Brave-Browser", "Application", "brave.exe")]),
            ("Opera", "opera://extensions", [
                Path.Combine(local, "Programs", "Opera", "launcher.exe"),
                Path.Combine(programFiles, "Opera", "launcher.exe")]),
            ("Vivaldi", "vivaldi://extensions", [
                Path.Combine(local, "Vivaldi", "Application", "vivaldi.exe"),
                Path.Combine(programFiles, "Vivaldi", "Application", "vivaldi.exe")]),
        };
        return candidates
            .Select(item => new BrowserChoice(item.Name, item.Paths.FirstOrDefault(File.Exists) ?? "", item.Url))
            .Where(item => item.Exe.Length > 0)
            .ToList();
    }
}

internal static class ExtensionFiles
{
    private const string Prefix = "VKExtension.";
    internal static string[] Names => Assembly.GetExecutingAssembly().GetManifestResourceNames().Where(name => name.StartsWith(Prefix)).ToArray();

    internal static string Read(string name)
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(Prefix + name) ?? throw new FileNotFoundException("Файл расширения не найден: " + name);
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }

    internal static void CopyTo(string destination)
    {
        Directory.CreateDirectory(destination);
        foreach (var resource in Names)
        {
            using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(resource) ?? throw new FileNotFoundException(resource);
            using var file = File.Create(Path.Combine(destination, resource.Substring(Prefix.Length)));
            stream.CopyTo(file);
        }
    }
}

internal sealed class SetupForm : Form
{
    private static readonly Color Background = Color.FromArgb(20, 20, 20);
    private static readonly Color Panel = Color.FromArgb(34, 34, 34);
    private static readonly Color TextColor = Color.FromArgb(225, 227, 230);
    private static readonly Color Muted = Color.FromArgb(153, 162, 173);
    private static readonly Color Blue = SetupBrand.Accent;
    private readonly IReadOnlyList<BrowserChoice> browsers;
    private readonly ComboBox browserPicker = new();
    private readonly Label instruction = new();
    private readonly Button installButton = new();
    private readonly LinkLabel copyUrl = new();
    private readonly LinkLabel copyPath = new();

    internal SetupForm(IReadOnlyList<BrowserChoice> browsers)
    {
        this.browsers = browsers;
        Text = SetupBrand.Title + " — установка";
        ClientSize = new Size(542, 480);
        MinimumSize = MaximumSize = Size;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Background;
        ForeColor = TextColor;
        Font = new Font(SetupBrand.FontName, 10, FontStyle.Regular, GraphicsUnit.Point);
        DoubleBuffered = true;

        var logo = new VkMark { Location = new Point(28, 24), Size = new Size(40, 40) };
        Controls.Add(logo);
        AddLabel(SetupBrand.Title, 80, 22, 18, FontStyle.Bold, TextColor);
        AddLabel("Простая установка оформления браузера", 82, 58, 10, FontStyle.Regular, Muted);

        var card = new Panel { BackColor = Panel, Location = new Point(25, 108), Size = new Size(492, 318) };
        Controls.Add(card);
        var heading = new Label { Text = "Выберите браузер", Location = new Point(19, 19), Size = new Size(450, 25), Font = new Font(Font.FontFamily, 13, FontStyle.Bold), ForeColor = TextColor };
        card.Controls.Add(heading);
        browserPicker.Location = new Point(19, 53);
        browserPicker.Size = new Size(452, 32);
        browserPicker.DropDownStyle = ComboBoxStyle.DropDownList;
        browserPicker.FlatStyle = FlatStyle.Flat;
        browserPicker.BackColor = Color.FromArgb(51, 51, 51);
        browserPicker.ForeColor = TextColor;
        browserPicker.Font = new Font(Font.FontFamily, 11);
        browserPicker.Items.AddRange(browsers.Select(item => item.Name).ToArray());
        if (browsers.Count > 0) browserPicker.SelectedIndex = 0;
        card.Controls.Add(browserPicker);

        instruction.Text = "Нажмите кнопку: файлы расширения будут разложены, откроются браузер и папка. Дальше останется три простых шага — они появятся здесь.";
        instruction.Location = new Point(19, 98);
        instruction.Size = new Size(456, 100);
        instruction.ForeColor = Muted;
        instruction.Font = new Font(Font.FontFamily, 10);
        card.Controls.Add(instruction);

        installButton.Text = "Подготовить и открыть установку";
        installButton.Location = new Point(19, 205);
        installButton.Size = new Size(452, 41);
        installButton.BackColor = Blue;
        installButton.ForeColor = Color.White;
        installButton.FlatStyle = FlatStyle.Flat;
        installButton.FlatAppearance.BorderSize = 0;
        installButton.Cursor = Cursors.Hand;
        installButton.Font = new Font(Font.FontFamily, 11, FontStyle.Bold);
        installButton.Enabled = browsers.Count > 0;
        installButton.Click += (_, _) => Prepare();
        card.Controls.Add(installButton);

        ConfigureLink(copyUrl, "Скопировать адрес страницы расширений", new Point(19, 258), () =>
        {
            if (browserPicker.SelectedIndex >= 0) Clipboard.SetText(browsers[browserPicker.SelectedIndex].ExtensionsUrl);
        });
        ConfigureLink(copyPath, "Скопировать путь к папке", new Point(19, 284), () => Clipboard.SetText(Destination));
        card.Controls.Add(copyUrl);
        card.Controls.Add(copyPath);

        var footer = AddLabel("Без входа в аккаунт и без изменения настроек браузера", 27, 442, 10, FontStyle.Regular, Muted);
        footer.AutoSize = true;
        if (browsers.Count == 0) instruction.Text = "Поддерживаемый браузер не найден. Установите Chrome, Edge, Brave, Opera или Vivaldi.";
    }

    private void ConfigureLink(LinkLabel link, string text, Point location, Action copy)
    {
        link.Text = text;
        link.Location = location;
        link.AutoSize = true;
        link.Visible = false;
        link.LinkColor = link.ActiveLinkColor = Color.FromArgb(113, 170, 235);
        link.LinkBehavior = LinkBehavior.HoverUnderline;
        link.Font = new Font(Font.FontFamily, 10);
        link.LinkClicked += (_, _) =>
        {
            copy();
            link.Text = "Скопировано ✓";
            var timer = new System.Windows.Forms.Timer { Interval = 1400 };
            timer.Tick += (_, _) => { link.Text = text; timer.Dispose(); };
            timer.Start();
        };
    }

    private Label AddLabel(string value, int x, int y, int size, FontStyle style, Color color)
    {
        var label = new Label { Text = value, Location = new Point(x, y), AutoSize = true, Font = new Font(Font.FontFamily, size, style), ForeColor = color };
        Controls.Add(label);
        return label;
    }

    private static string Destination => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), SetupBrand.DestinationFolder, "Extension");

    private void Prepare()
    {
        if (browserPicker.SelectedIndex < 0) return;
        try
        {
            var manifest = ExtensionFiles.Read("manifest.json");
            if (!Regex.IsMatch(manifest, "\\\"manifest_version\\\"\\s*:\\s*3\\b")) throw new InvalidDataException("Неверный формат расширения.");

            ExtensionFiles.CopyTo(Destination);
            var choice = browsers[browserPicker.SelectedIndex];
            // Chromium ignores chrome:// URLs passed as command-line targets. Open the
            // browser first and enter the internal URL in its address bar instead.
            Clipboard.SetText(choice.ExtensionsUrl);
            var opened = Program.OpenExtensionsPage(choice);
            Thread.Sleep(450);
            Process.Start(new ProcessStartInfo("explorer.exe", $"/select,\"{Destination}\"") { UseShellExecute = true });
            instruction.Text =
                (opened
                    ? "1. В открытой странице расширений включите «Режим разработчика».\n"
                    : "1. Откройте адрес из буфера и включите «Режим разработчика».\n") +
                "2. Нажмите «Загрузить распакованное» и выберите папку «Extension».\n" +
                "3. При обновлении нажмите ↻ на карточке расширения, затем обновите вкладки " + SetupBrand.RefreshTabs + ".";
            installButton.Text = "Повторить (файлы обновятся)";
            copyUrl.Visible = copyPath.Visible = true;
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "Не удалось подготовить установку", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}

internal sealed class VkMark : Control
{
    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
#if REVERSE_EXTENSION
        using var red = new SolidBrush(Color.FromArgb(255, 0, 51));
        using var white = new SolidBrush(Color.White);
        e.Graphics.FillRoundedRectangle(red, new Rectangle(1, 5, 38, 30), 9);
        e.Graphics.FillPolygon(white, [new Point(16, 12), new Point(29, 20), new Point(16, 28)]);
#else
        using var blue = new SolidBrush(Color.FromArgb(0, 119, 255));
        using var red = new SolidBrush(Color.FromArgb(255, 43, 66));
        using var white = new SolidBrush(Color.White);
        e.Graphics.FillRoundedRectangle(blue, new Rectangle(1, 1, 37, 37), 9);
        e.Graphics.FillRoundedRectangle(red, new Rectangle(8, 1, 30, 37), 9);
        e.Graphics.FillPolygon(white, [new Point(14, 12), new Point(28, 20), new Point(14, 28)]);
#endif
    }
}

internal static class GraphicsExtensions
{
    internal static void FillRoundedRectangle(this Graphics graphics, Brush brush, Rectangle bounds, int radius)
    {
        using var path = new GraphicsPath();
        var diameter = radius * 2;
        path.AddArc(bounds.X, bounds.Y, diameter, diameter, 180, 90);
        path.AddArc(bounds.Right - diameter, bounds.Y, diameter, diameter, 270, 90);
        path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
        path.AddArc(bounds.X, bounds.Bottom - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        graphics.FillPath(brush, path);
    }
}
