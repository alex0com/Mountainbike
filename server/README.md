# Bluecow Rager two-player relay

A small WebSocket relay (`relay.js`) that pairs two games in a room by a four-letter code and passes their messages between them. Apache serves the game as before and forwards `/mp` to the relay.

The relay keeps no game state of its own. Both games build the same mountain from a shared seed and send each other only their riders. The host's game keeps the round clock.

## Install

On the server, with Node 18 or later:

    cd /opt/bluecow
    cp -r path/to/repo/server/* .
    npm install --omit=dev

## Run it as a service

`/etc/systemd/system/bluecow-relay.service`:

    [Unit]
    Description=Bluecow Rager two-player relay
    After=network.target

    [Service]
    WorkingDirectory=/opt/bluecow
    ExecStart=/usr/bin/node relay.js
    Environment=PORT=8090 HOST=127.0.0.1
    Restart=always
    User=www-data

    [Install]
    WantedBy=multi-user.target

Then:

    sudo systemctl daemon-reload
    sudo systemctl enable --now bluecow-relay
    journalctl -u bluecow-relay -f        # "bluecow relay on ws://127.0.0.1:8090"

## Apache

Enable the proxy modules:

    sudo a2enmod proxy proxy_http proxy_wstunnel

Add this to the site's `<VirtualHost>`, preferably the HTTPS one so the game connects over `wss://`:

    ProxyPass        /mp  ws://127.0.0.1:8090/
    ProxyPassReverse /mp  ws://127.0.0.1:8090/

Then:

    sudo apachectl configtest && sudo systemctl reload apache2

The game connects to `/mp` on the same host it was loaded from:
- `wss://` when the page is served over HTTPS, `ws://` over HTTP;
- `?mp=ws://host:port` in the game's address points it somewhere else;
- opened from a file, it tries `ws://localhost:8090`.

## Playing

- **Hosting:** MENU → 2 PLAYERS → HOST A RIDE. Or, while riding alone, tap INVITE. A room code appears with a SHARE button.
- **Joining:** the friend opens the shared link (`...?join=CODE`) or picks JOIN WITH A CODE. They drop in beside the host, on the same mountain.

## Testing locally

    cd server && npm install && node relay.js

Then open the game from a file in two browser windows. The first hosts; the second goes to `Downhill%20MTB%203D.html?join=CODE`.
