#!/bin/sh
# Link aulactl and the GNOME extension from this project into place (edits here go live).
set -e
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p ~/.local/bin ~/.local/share/gnome-shell/extensions
ln -sfn "$here/aulactl" ~/.local/bin/aulactl
ln -sfn "$here/extension" ~/.local/share/gnome-shell/extensions/aula-f75@kaloyan
gnome-extensions enable aula-f75@kaloyan 2>/dev/null || true
echo "Installed. On Wayland, log out and back in once so GNOME Shell loads the extension."
