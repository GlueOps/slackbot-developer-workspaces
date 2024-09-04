const registeredButtons = {
    button_list_servers: {
        command: 'vm',
    },
    button_create_vm: {
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
    }
};

export default registeredButtons;