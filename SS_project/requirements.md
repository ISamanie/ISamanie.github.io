User UI
    Create a 4 way superscalar out of order simulator in html, model the user ui after vs code I will include an image of the layout I would like. On the left hand side bar feature a top.sv file as well as a file for all the different features like prf, rob, rru, issue queue, fetch, execution. The main "code" section of each file should feature a live simulator that models the out of order processor on the user assembly code. The user should be able to provide the simulator with assembly code via the terminal at the bottom of the page. On the righthand panel include a chat section which connects to a python backend to send request to an open ai api, allowing the user to ask questions about features of the design, as well as provide alternative designs and background as to why certain design decions are made.

    Users should be able to click on the left hand side bar files to zoom into different features, also when they select a feature provide them with alternative designs and background as to why certain designs may be chosen over others in the terminal section. Temperarily hiding the user code until they return to top.sv.

    Limit user code to 16 instructions.

    Allow the user to step thru the iteration of the processor cycle by cycle.

    I will provide you with the implementation for the features and top in sv, translate them into javascript for this project

    Add a summary section underneath the files on the left hand side where you describe the general design.
