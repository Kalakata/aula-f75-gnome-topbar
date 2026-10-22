#!/bin/sh
# Link aulactl and the GNOME extension from this project into place (edits here go live),
# and install the udev rule that lets your user talk to the keyboard without sudo.
set -e
here=$(cd "$(dirname "$0")" && pwd)
uuid=aula-f75-topbar@kalakata.github.io
rule=/etc/udev/rules.d/70-aula-f75.rules

old=/etc/udev/rules.d/99-aula-f75.rules   # earlier versions: also exposed the keystroke interface
if ! cmp -s "$here/70-aula-f75.rules" "$rule" || [ -e "$old" ]; then
    echo "Installing udev rule to $rule (needs sudo)..."
    sudo rm -f "$old"
    sudo install -m 644 "$here/70-aula-f75.rules" "$rule"
    sudo udevadm control --reload
    sudo udevadm trigger --subsystem-match=hidraw --action=change
fi

mkdir -p ~/.local/bin ~/.local/share/gnome-shell/extensions
ln -sfn "$here/aulactl" ~/.local/bin/aulactl
ln -sfn "$here/extension" ~/.local/share/gnome-shell/extensions/$uuid
gnome-extensions enable $uuid 2>/dev/null || true

# Super+Shift+S: play snake. The terminal window has to stay focused to read the arrow keys.
play="sh -c '$HOME/.local/bin/aulactl play || { echo; echo Press Enter to close; read _; }'"
if command -v ptyxis >/dev/null; then
    term="ptyxis -s -x \"$play\""   # -s: a plain -x handed to the running instance opened an empty shell
else
    term="xdg-terminal-exec $play"
fi
key=org.gnome.settings-daemon.plugins.media-keys
path=/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/aula-snake/
gsettings set $key custom-keybindings "$(gsettings get $key custom-keybindings | python3 -c "
import ast, sys; s=sys.stdin.read().strip(); l=ast.literal_eval(s.split(' ',1)[1] if s.startswith('@') else s)
print([p for p in l if p!='$path']+['$path'])")"
gsettings set $key.custom-keybinding:$path name 'Aula snake game'
gsettings set $key.custom-keybinding:$path command "$term"
gsettings set $key.custom-keybinding:$path binding '<Shift><Super>s'
echo "Installed. On Wayland, log out and back in once so GNOME Shell loads the extension."
