#!/bin/sh
# Link aulactl and the GNOME extension from this project into place (edits here go live),
# and install the udev rule that lets your user talk to the keyboard without sudo.
set -e
here=$(cd "$(dirname "$0")" && pwd)
uuid=aula-f75-topbar@kalakata.github.io
rule=/etc/udev/rules.d/70-aula-f75.rules

if ! cmp -s "$here/70-aula-f75.rules" "$rule"; then
    echo "Installing udev rule to $rule (needs sudo)..."
    sudo install -m 644 "$here/70-aula-f75.rules" "$rule"
    sudo udevadm control --reload
    sudo udevadm trigger --subsystem-match=hidraw --action=change
fi

mkdir -p ~/.local/bin ~/.local/share/gnome-shell/extensions
ln -sfn "$here/aulactl" ~/.local/bin/aulactl
ln -sfn "$here/extension" ~/.local/share/gnome-shell/extensions/$uuid
gnome-extensions enable $uuid 2>/dev/null || true
echo "Installed. On Wayland, log out and back in once so GNOME Shell loads the extension."
