'''from .serializer import UserSerializer


def jwt_response_handler(token, user=None, request=None):
    print("jwt_response_handler : {0}".format(token))
    return {
        'token': token,
        'user': UserSerializer(user, context={'request': request}).data
    }
'''