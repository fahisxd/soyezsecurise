import sqlite3
from fastapi import FastAPI

app = FastAPI()
conn = sqlite3.connect(
    'database.db',
    check_same_thread=False
)
cursor = conn.cursor()

@app.get("/")
def home():
    return  {"message": "Hello, World!"}
@app.get("/msg/{data}")
def geting(data):
    return {"message" : data}
@app.get("/calc/{num1}/{num2}/{operation}")
def calculate(num1: float, num2: float, operation: str):
    if operation == "add":
        return {"result": num1 + num2}
    elif operation == "subtract":
        return {"result": num1 - num2}
    elif operation == "multiply":
        return {"result": num1 * num2}
    elif operation == "divide":
        if num2 != 0:
            return {"result": num1 / num2}
        else:
            return {"error": "Cannot divide by zero"}
    else:
        return {"error": "Invalid operation"}
    
@app.get("/newuser")
def cuser(username: str, password: str):
    cursor.execute(""" 
    CREATE TABLE IF NOT EXISTS users ( 
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT, 
    password TEXT)""")
    conn.commit()
