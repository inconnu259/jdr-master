from django.shortcuts import render
from django.contrib.auth.decorators import login_required


@login_required(login_url="login/")
def personageList(request):
    return render(request, "personageList.html")
