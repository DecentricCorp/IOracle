FROM node

RUN mkdir /src/
WORKDIR /src
COPY . /src/
COPY ./package.json /src/
RUN chmod u+x /src/entry.sh
RUN npm install

#CMD "./src/entry.sh"
CMD ["sh", "-c", "bash entry.sh"]

