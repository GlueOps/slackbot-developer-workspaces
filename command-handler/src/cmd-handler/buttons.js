const registeredButtons = {
    button_list_servers: {
        command: 'vm',
    },
    button_delete_vm: {
        command: 'vm',
    },
    button_click: {
        command: 'button',
    },
    //regex patterns to match generated buttons
    "^button_start_": {
        command: 'vm',
        isRegex: true,
    },
    "^button_stop_": {
        command: 'vm',
        isRegex: true,
    },
    "^button_delete_": {
        command: 'vm',
        isRegex: true,
    },
    "^button_create_image_": {
        command: 'vm',
        isRegex: true,
    },
    "^button_create_vm": {
        command: 'vm',
        isRegex: true,
    },
    "^button_select_hetzner_server": {
        command: 'vm',
        isRegex: true,
    },
    "^button_select_aws_server": {
        command: 'vm',
        isRegex: true,
    },
    "^button_select_hetzner_image": {
        command: 'vm',
        isRegex: true,
    },
    "^button_select_aws_image": {
        command: 'vm',
        isRegex: true,
    },
};

export default registeredButtons;