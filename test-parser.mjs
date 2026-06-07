import { parse } from 'pgsql-ast-parser'; console.log(JSON.stringify(parse('CREATE TABLE posts ( id integer, FOREIGN KEY (id) REFERENCES users(id) );'), null, 2));
