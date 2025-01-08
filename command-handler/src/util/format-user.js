/*
    This file is responsible for how the user is formatted.
    Specifically, it takes a user email that is retrieved from 
    the user that is running the command, and formats it for the
    tag used in tailscale and vm clouds.
*/

const formatUser = (user) => {
    // split the user email at the '@' symbol, and replace special characters with '-', and convert to lowercase.
    const formattedUser = user.split('@')[0].replaceAll('.', '-').replaceAll('_', '-').toLowerCase();
    return formattedUser;
}

export default formatUser;