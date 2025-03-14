/*
    This file contains the list of buttons that are registered with the command handler.
    This list tells the button handler, which command should handle the button click.
    This list contains both regex patterns and static button names.
    The static are defined by the programmer while the regex patterns are generated by the command handler.
    Each button is a JSON object with the button name as the object name with a key value pair of command 
    and the command name that should handle the button click.
*/

const registeredButtons = {
    //static buttons that are defined by the programmer
    button_list_servers: {
        command: 'vm',
    },
    button_delete_vm: {
        command: 'vm',
    },
    button_click: {
        command: 'button',
    },
    /*
    regex patterns to match generated buttons
    The regex matches the buttons at the start of the string,
    with the trailing _ not being the end of the string in the match
    */
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
    "^button_select_": {
        command: 'vm',
        isRegex: true,
    },
};

export default registeredButtons;