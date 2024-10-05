const formatUser = (user) => {
    const formattedUser = user.split('@')[0].replaceAll('.', '-').replaceAll('_', '-').toLowerCase();
    return formattedUser;
}

export default formatUser;