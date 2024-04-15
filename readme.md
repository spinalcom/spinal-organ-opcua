# Spinal-organ-opcua


## Description

The purpose of this organ is to connect a client using OPC UA protocol with the BOS (Building Operating System) thus allowing device discovery , data extraction and device monitoring.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)

## prerequisites
spinal-organ-opcua requires at less :
    - node version 16 
    - npm version 6 

## Installation

To install this connector clone it, then inside de folder run npm install.

```
git clone [text](https://github.com/spinalcom/spinal-organ-opcua.git)
npm install
``

## Usage

Running this connector requires private information in .env file.

Rename ```.env copy``` file as ```.env```, then modify the following information :


```

ORGAN_NAME="name"                               # the connector config name
USER_ID="XXX"                                   # hub user id
PASSWORD="*******"                              # hub user password
PROTOCOL="http"                                 # protocol used to connect to the hub
HOST="127.0.0.1"                                # hub host
PORT=8080                                       # hub port
ORGAN_FOLDER_PATH="/__users__/admin/organs"     # the path to store/retrieve the connector config file

OPCUA_SERVER_ENTRYPOINT="/"                     #if empty, the server will discover the default entry point (Objects Folder) otherwise, it will use the provided path.


```


This connector also requires the viewer plugin [text](https://github.com/spinalcom/spinal-env-viewer-plugin-opcua-manager). you can follow the link to know how to intall the plugin.
