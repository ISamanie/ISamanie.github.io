I started on claude, then transitioned to gemini for adding/modifying features.

I started by writing a requirement.txt file and providing that to claude, along with an image of the layout I wanted
    Create a 4 way superscalar out of order simulator in html, model the user ui after vs code I will include an image of the layout I would like. On the left hand side bar feature a top.sv file as well as a file for all the different features like prf, rob, rru, issue queue, fetch, execution. The main "code" section of each file should feature a live simulator that models the out of order processor on the user assembly code. The user should be able to provide the simulator with assembly code via the terminal at the bottom of the page. On the righthand panel include a chat section which connects to a python backend to send request to an open ai api, allowing the user to ask questions about features of the design, as well as provide alternative designs and background as to why certain design decions are made.

    Users should be able to click on the left hand side bar files to zoom into different features. Temperarily hiding the user code until they return to top.sv.

    Allow the user to step thru the iteration of the processor cycle by cycle.

    I will provide you with the implementation for the features and top in sv, translate them into javascript for this project
I then verified the work by tracing a few testcases manually. I also had to specify how I wanted the execution units of the modules to work since that was not included in the files I provided.

The original modules were hard to read, so i had to change what data was made visible, and added animations for adding and removing instructions.

I then asked for the main viewing window to be resized to show all the modules without scrolling.
I then asked for help connecting the frontend and backend of the program. This took a few tries as I had forgotten
the requirements.txt and had renamed my app.py file to server.py so the setup was different from hw4.
I then worked on the instruction flow animations, this took longer than I expected since gemini kept making ui decisions that did not look very naturally. First it made paths on top of other modules and the path would be fixed to the screen not scrolling with the window, they also overlayed the paths on top of the terminal, so I had to re-prompt take a look at the source code and help pinpoint the issue.

I then made the instructions different colors to signify them leaving different modules, worked on showing multiple instructions leaving a module in parrallel instead of sequentially.

I didn't know we were suppose to include all the prompts. I prompted across several AI and sessions here is one of the longer ones.

"make this code more human readable ie indentations, new lines, comments and descriptive variable names, add animations for instructions data flow"
- this was given to gemini, the code claude provided was horribly formatted and impossible to read/understand.

"make it so that you can see instructions entering and leaving a module in small boxes that traverse across the screen"

"slow down the animation and add fixed wire paths between component on which the instructions travel"

"style was broken somewhere modules no longer spawn"

"Better now change it so that wires do not run around the boundary of the window, expand the window size if nessesary, do not overlap wires"

"make the top.sv window taller and wider, also make the paths resemble pcb traces(straight wire paths with curved edges, no diagonals)"

"make the terminal window collapsable, and shorten the width of the chat assistance window by about 10"

"shrink the size of the modules so that all of them(width wise) fit on the screen without scrollingm ake it so that all the modules fit on the top.sv window(width wise, vertical scrolling is fine)"

"make it so that all modules fit in the defualt window size"

"add a prev button to go back one clock cycle, do this by keeping a list of previous cycles and simply popping and reapplying those changes"

"render deployment failed with a build error, it looks like it can't find flask or openai. how should my requirements.txt look for this python backend?"

"it works fine locally on localhost:5000 but on render it says build succeeded then fails with a port binding error. how do i make server.py bind to the dynamic port render gives it?"

"i renamed app.py to server.py and now render crashes saying ModuleNotFoundError: No module named 'app'. where do i fix the start command so it runs server.py instead?"

"the frontend is throwing a CORS error in the console when trying to send the chat message to my render url. how do i enable cors in flask so it accepts requests from anywhere?"

"getting a 500 internal server error on render when the chat panel asks openai a question"

"render keeps timing out because gunicorn kills the program before the openai api finishes responding. how do i increase the timeout limit in the start command?"

"render build log says gunicorn: command not found. do i need to put gunicorn in requirements.txt or can my start command just be python server.py?"

I also had chats where I worked on the ui for the modules, but i cant seem to find them.