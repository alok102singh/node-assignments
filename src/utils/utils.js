const JSON_URL = 'https://jsonplaceholder.typicode.com/comments'
const sqlite3 = require('sqlite3').verbose();
const request = require('request');
const db = new sqlite3.Database('./jsondb.db');

function _getAllData(page=1){
    const limit = 30;
    const offset = (page - 1) * 30;
    let sql = `SELECT * FROM sampleData order by id limit (?) offset (?)`;
    return new Promise((resolve, reject) => {
        db.all(sql, [limit, offset], (err, rows) => {
            if (err) {
                console.log('Error running sql: ' + sql)
                console.log(err)
                reject(err)
            } else {
                resolve(rows)
            }
        })
    })
}


function _insertMultipleData(data){
    return Promise.resolve()
        .then(()=>{
            var insert = 'INSERT INTO sampleData (id, postId, name, email, body) VALUES (?, ?, ?, ?, ?)';
            return db.run(insert, [data['id'], data['postId'], data['name'], data['email'], data['body']]);
        })
        .catch((error)=>{
            return [];
        })
}

function _insertAllData(){
    return Promise.resolve()
        .then(()=>{
            const options = {
                'method': 'GET',
                'url': JSON_URL
            };
            return request(options, function (error, response) {
                if (error) throw new Error(error);
                let arrayPromise = [];
                const responseData = JSON.parse(response.body)
                for (let i = 0; i < responseData.length; i++) {
                    arrayPromise.push(_insertMultipleData(responseData[i]));
                }
                return Promise.allSettled(arrayPromise);
            });
        })
        .catch((error)=>{
            return Promise.reject(error);
        })
}



module.exports = {
    _getAllData,
    _insertAllData
}