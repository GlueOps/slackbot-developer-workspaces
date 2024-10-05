const formatUser = (user) => {
    const formatedUser = user.split('@')[0].replaceAll('.', '-').replaceAll('_', '-').toLowerCase();
    return formatedUser;
}

export default formatUser;