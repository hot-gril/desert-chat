# desert-chat
Desert Chat, easy and secure chat app. WIP.

Current implementation is text-only chat rooms with a lame CLI, but it exercises the basic design. Much more to come, like video. Think of a room-based UI reminiscent of both Zoom and Facebook Messenger.

Read the full design doc [here](https://docs.google.com/document/d/1BORD3gDLjhp_MjSfiBAAVqthWbmlx__7iy-Il8MSCx0/edit?usp=sharing).

TL;DR: End-to-end encrypted always. Servers are barebones, nearly just packet routers, and anyone can run one. Unlike everything else, servers aren't trusted to exchange the public keys, rather the room invitation links encode them. From the servers' perspective, each client has a separate account for each room, aiding in privacy. Each room lives on one server, and we don't bother with server federation, but clients remember each others' identities across rooms (if they choose to share). Hence servers are as expendible as possible, and clients are smart.

Despite this techie stuff, Desert Chat is primarily for average people to use. Not everyone cares about the security, but it won't get in the way.

Why do we do this, cause we have a passion for messaging and passionately dislike the current state of it. \
**Contributors welcome and needed.**
