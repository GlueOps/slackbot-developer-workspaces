#!/bin/bash
sudo cp /var/lib/libvirt/templates/{{IMAGE}} /var/lib/libvirt/images/{{SERVER_NAME}}.qcow2

userDataFile=$(mktemp)
echo -e "{{USER_DATA}}" > "$userDataFile"
sudo virt-install \
  --name {{SERVER_NAME}} \
  --ram 10240 \
  --vcpus 2 \
  --disk path=/var/lib/libvirt/images/{{SERVER_NAME}}.qcow2,format=qcow2 \
  --os-variant linux2022 \
  --network bridge=virbr0,model=virtio \
  --cloud-init user-data=${userDataFile} \
  --noautoconsole \
  --import
rm -f "$userDataFile"
