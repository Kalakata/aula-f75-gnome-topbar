// Top-bar menu for aulactl. All keyboard I/O stays in aulactl; this only starts/stops it.
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const AULACTL = GLib.build_filenamev([GLib.get_home_dir(), '.local', 'bin', 'aulactl']);
// running animations re-read this twice a second (see live() in aulactl)
const LIVE = GLib.build_filenamev([GLib.get_home_dir(), '.config', 'aula', 'live.json']);
// animation speed: slider 0..1 -> 0.25x..2x, 1x at 2/3
const toSpeed = v => 0.25 * 8 ** v;
const fromSpeed = s => Math.log(s / 0.25) / Math.log(8);
const SIGINT = 2;

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'Aula F75');
        this.add_child(new St.Icon({icon_name: 'input-keyboard-symbolic', style_class: 'system-status-icon'}));
        this._proc = null;
        this._playing = null;
        this._items = {};

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Animations'));
        // filled from `aulactl animations` on every open, so new animations need no re-login
        this._anims = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._anims);
        const stop = new PopupMenu.PopupMenuItem('Stop animation');
        stop.connect('activate', () => this._stop());
        this.menu.addMenuItem(stop);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._bri = this._addSlider('Brightness', () => this._applyBrightness());
        this._spd = this._addSlider('Speed', () => this._applySpeed());

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._effects = new PopupMenu.PopupSubMenuMenuItem('Built-in effects');
        this.menu.addMenuItem(this._effects);
        // reload on open so the dot follows changes made from the terminal or Fn keys
        this.menu.connect('open-state-changed', (_m, open) => {
            if (!open) return;
            this._loadAnims();
            this._refresh();
        });
        this._loadAnims();
    }

    _loadAnims() {
        // only lists names, never touches the keyboard, so it is safe while an animation runs
        const proc = Gio.Subprocess.new([AULACTL, 'animations'], Gio.SubprocessFlags.STDOUT_PIPE);
        proc.communicate_utf8_async(null, null, (p, res) => {
            const [, out] = p.communicate_utf8_finish(res);
            const names = out.split('\n').filter(Boolean);
            if (!names.length) return;   // keep the old list if aulactl failed
            this._anims.removeAll();
            this._items = {};
            for (const name of names) {
                const item = new PopupMenu.PopupMenuItem(name[0].toUpperCase() + name.slice(1));
                item.connect('activate', () => this._play(name));
                this._anims.addMenuItem(item);
                this._items[name] = item;
            }
            this._mark(this._playing);
        });
    }

    _addSlider(label, apply) {
        const item = new PopupMenu.PopupBaseMenuItem({activate: false});
        item.add_child(new St.Label({text: label, y_align: 2 /* CENTER */, style: 'min-width: 6em'}));
        const slider = new Slider(0.5);
        slider.x_expand = true;
        item.add_child(slider);
        this.menu.addMenuItem(item);
        // debounce: a drag fires many changes; send only the value it settles on
        slider.connect('notify::value', () => {
            if (slider._quiet) return;
            if (slider._timer) GLib.source_remove(slider._timer);
            slider._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
                slider._timer = 0;
                apply();
                return GLib.SOURCE_REMOVE;
            });
        });
        return slider;
    }

    _setQuietly(slider, v) {
        slider._quiet = true;
        slider.value = Math.max(0, Math.min(1, v));
        slider._quiet = false;
    }

    _readLive() {
        try {
            const [, bytes] = GLib.file_get_contents(LIVE);
            return JSON.parse(new TextDecoder().decode(bytes));
        } catch {
            return {};
        }
    }

    _writeLive() {
        GLib.mkdir_with_parents(GLib.path_get_dirname(LIVE), 0o755);
        GLib.file_set_contents(LIVE, JSON.stringify({
            brightness: Math.max(0.05, this._bri.value),   // never fully dark, it looks like a crash
            speed: toSpeed(this._spd.value),
        }));
    }

    _applyBrightness() {
        if (this._proc) this._writeLive();
        else this._configWrite(['brightness', `${Math.round(this._bri.value * 9)}`]);
    }

    _applySpeed() {
        if (this._proc) this._writeLive();
        else this._configWrite(['speed', `${Math.round(this._spd.value * 4)}`]);
    }

    // one config write at a time (overlapping writes crash the firmware); keep only the newest pending
    _configWrite(args) {
        if (this._writer) { this._pending = args; return; }
        this._writer = Gio.Subprocess.new([AULACTL, ...args], Gio.SubprocessFlags.NONE);
        this._writer.wait_async(null, () => {
            this._writer = null;
            const next = this._pending;
            this._pending = null;
            if (next) this._configWrite(next);
        });
    }

    _refresh() {
        if (this._proc) {
            // reading the keyboard while an animation streams garbles both, so show the live values only
            const live = this._readLive();
            this._setQuietly(this._bri, live.brightness ?? 1);
            this._setQuietly(this._spd, fromSpeed(live.speed ?? 1));
            return;
        }
        const proc = Gio.Subprocess.new([AULACTL, 'info'], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_MERGE);
        proc.communicate_utf8_async(null, null, (p, res) => {
            const [, out] = p.communicate_utf8_finish(res);
            const b = out.match(/^brightness\s+(\d+)/m), s = out.match(/^speed\s+(\d+)/m);
            if (b) this._setQuietly(this._bri, b[1] / 9);
            if (s) this._setQuietly(this._spd, s[1] / 4);
            this._loadEffects();   // after info, so the two never talk to the keyboard at once
        });
    }

    _play(name) {
        this._stop();
        const proc = Gio.Subprocess.new([AULACTL, 'animate', name], Gio.SubprocessFlags.NONE);
        this._proc = proc;
        this._mark(name);
        proc.wait_async(null, () => {
            if (this._proc === proc) { this._proc = null; this._mark(null); }
        });
    }

    _stop() {
        // SIGINT lets aulactl exit through KeyboardInterrupt, which also stops its pw-record child
        this._proc?.send_signal(SIGINT);
        this._proc = null;
        this._mark(null);
    }

    _mark(name) {
        this._playing = name;
        for (const [n, item] of Object.entries(this._items))
            item.setOrnament(n === name ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NO_DOT);
    }

    _loadEffects() {
        const proc = Gio.Subprocess.new([AULACTL, 'list'],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_MERGE);
        proc.communicate_utf8_async(null, null, (p, res) => {
            const [, out] = p.communicate_utf8_finish(res);
            const menu = this._effects.menu;
            menu.removeAll();
            const rows = out.split('\n')
                .map(l => l.match(/^([* ]) +(\d+) {2}(.*)$/))
                .filter(m => m && !/^\?$|off - no visible|UNSTABLE/.test(m[3]));
            if (!rows.length) {
                menu.addMenuItem(new PopupMenu.PopupMenuItem('Keyboard not connected (USB-C)', {reactive: false}));
                return;
            }
            for (const [, cur, n, desc] of rows) {
                const item = new PopupMenu.PopupMenuItem(`${n}  ${desc}`);
                item.setOrnament(cur === '*' ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NO_DOT);
                item.connect('activate', () => {
                    this._stop();
                    Gio.Subprocess.new([AULACTL, 'effect', n], Gio.SubprocessFlags.NONE);
                });
                menu.addMenuItem(item);
            }
        });
    }

    destroy() {
        this._stop();
        for (const s of [this._bri, this._spd])
            if (s._timer) GLib.source_remove(s._timer);
        super.destroy();
    }
});

export default class AulaExtension extends Extension {
    enable() {
        this._indicator = new Indicator();
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
    }
}
