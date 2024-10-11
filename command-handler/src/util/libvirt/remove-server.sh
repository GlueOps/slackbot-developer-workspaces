#!/bin/bash
sudo virsh destroy {{SERVER_NAME}}
sleep 10
#Remove a vm (undefine it)
sudo virsh undefine {{SERVER_NAME}} --remove-all-storage
