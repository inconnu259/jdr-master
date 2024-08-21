#!/bin/bash

# Setting TimeZone
ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone
sed -i 's#date.timezone.*#date.timezone ="'$TZ'"#g' /usr/local/etc/php/php.ini

cd /var/www/api
# preparing app
if [[ $APP_ENV == "dev" ]]
then
  echo "Install dev dependencies"
  composer install
  php bin/console asset:install --symlink
fi
php bin/console lexik:jwt:generate-keypair --skip-if-exists
chown -R www-data: config/jwt
php bin/console d:m:m -n
php bin/console p:u:s
chown -R www-data: var
