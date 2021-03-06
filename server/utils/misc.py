# misc.py
import subprocess
from datetime import datetime


def get_git_changeset(absolute_path):
    repo_dir = absolute_path
    git_show = subprocess.Popen(
        "git show --pretty=format:%ct --quiet HEAD",
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        shell=True, cwd=repo_dir, universal_newlines=True,
    )
    timestamp = git_show.communicate()[0].partition("\n")[0]
    try:
        timestamp = datetime.utcfromtimestamp(int(timestamp))
    except ValueError:
        return ""
    changeset = timestamp.strftime("%Y%m%d%H%M%S")
    return changeset


def jwt_get_secret_key(user_model):
    print("jwt_get_secret_key : user : {0}, secret: {1}".format(user_model.username, user_model.profile.jwt_secret))
    return user_model.profile.jwt_secret
