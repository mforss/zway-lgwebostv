# Z-Way - LGWebOSTV

LGWebOSTV is a Z-Way home automation module which makes it possible to
control your LG WebOS TV.

# Configuration

Start by enabling mobile TV on on your TV to make it possible to turn on.

LG Connect Apps must be enabled in the network settings of newer TVs.

You may also need to enable Wake-on-LAN on your TV to turn it on. Enable 
it by going to Settings > General > Mobile TV On > Turn On Via WiFi. Please 
note that 'WiFi' in this case only refers to the mobile device you are using
(i.e. phone, tablet, etc.) which must be connected to WiFi to wake your TV.
However, your TV must have a wired (Ethernet) connection because it is a 
limitation of the Wake-on-LAN protocol.

## IP-address

IP-address or DNS-name of the device. The IP-address can be found in the
network settings of the TV.

## MAC-address

MAC-address of the device, which is needed to wake the TV when it is off.
A Wake-on-LAN network message is broadcast to the ethernet network interface 
of the TV to turn it on. The MAC-address can be found in the network settings 
of the TV or on a label beside the network input of the TV.

## Enable polling

Polling is needed to sync TV state when the TV is controlled from the remote
control. Polling is only active if the TV has been switched on from Z-Way and
stays active until the TV is switched off. In other words, polling does not
sync state from the TV if the TV has been switched on from the remote control.

## App switches

App switches will be available first after the TV has been switched on from
Z-Way. Each started app will be registered by the module in the background
and after starting a few apps they should be listed in the configuration of
this module. Select the app switches you would like to create and save the 
configuration. After saving the configuration the app controls will be created.

# Virtual Devices

This module currently creates virtual devices for:

* Power control (binary switch)
* Volume control (multi-level switch)
* Apps controls (binary switches)

# Installation

The prefered way of installing this module is via the "Zwave.me App Store"
available in 2.2.0 and higher.

For developers and users of older Z-Way versions installation via git is
recommended.

```shell
cd /opt/z-way-server/automation/userModules
git clone https://github.com/mforss/zway-lgwebostv.git LGWebOSTV --branch latest
```

To update or install a specific version
```shell
cd /opt/z-way-server/automation/userModules/LGWebOSTV
git fetch --tags
# For latest released version
git checkout tags/latest
# For a specific version
git checkout tags/1.0.2
# For development version
git checkout -b master --track origin/master
```

# Known issues and limitations
Power on with Wake-on-LAN will only work if your TV has a wired (Ethernet) connection. 
Wake-on-LAN is limited to wired connections only and will not work with wireless connections.

This module will not work if your Z-Way controller is connected to another network 
than your TV. In these cases it may help if you set up port forwarding in your router
to forward traffic between the different networks.

There may be some stabiity issues with power on due to the nature of the Z-Way socket 
library. Sometimes the Wake-on-LAN message cannot be sent even if the sendto call of 
the socket library returns true. In these cases you will see the message 'Incomplete 
udp send' in the Z-Way log, wich probably comes from the socket library.

# License

LG WebOS icon from [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:LG_WebOS_New.svg).