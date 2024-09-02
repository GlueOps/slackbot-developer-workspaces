const formatUser = (user) => {
    const formatedUser = user.replaceAll('@', '-').replaceAll('.', '-').replaceAll('_', '-').toLowerCase();
    return formatedUser;
}

export default formatUser;