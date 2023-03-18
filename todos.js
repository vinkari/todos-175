const express = require('express');
const morgan = require('morgan');
const flash = require('express-flash');
const session = require('express-session');
const { body, validationResult } = require('express-validator');
const TodoList = require('./lib/todolist');
const Todo = require('./lib/todo');
const { sortTodoLists, sortTodos } = require('./lib/sort');
const store = require('connect-loki');

const app = express();
const host = 'localhost';
const port = 3000;
const LokiStore = store(session);

app.set('views', './views');
app.set('view engine', 'pug');

app.use(morgan('common'));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));

app.use(session({
  cookie: {
    httpOnly: true,
    maxAge: 31 * 24 * 60 * 60 * 1000,
    path: '/',
    secure: false,
  },
  name:'launch-school-todos-session-id',
  resave: false,
  saveUninitialized: true,
  secret: 'this is not very secure',
  store: new LokiStore({}),
}));

app.use(flash());

app.use((req, res, next) => {
  let todoLists = [];
  if ('todoLists' in req.session) {
    req.session.todoLists.forEach(todoList => {
      todoLists.push(TodoList.makeTodoList(todoList));
    });
  }

  req.session.todoLists = todoLists;
  next();
});

app.use((req, res, next) => {
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
});

const loadTodoList = (todoListId, todoLists) => {
  return todoLists.find(todoList => todoList.id === todoListId);
};

const deleteTodoList = (todoListId, todoLists) => {
  todoIndex = todoLists.findIndex(todoList => todoList.id === todoListId);
  todoLists.splice(todoIndex, 1);
};

const loadTodo = (todoListId, todoId, todoLists) => {
  let todoList = loadTodoList(+todoListId, todoLists);
  if (!todoList) return undefined;

  return todoList.findById(todoId);
};

const deleteTodo = (todoListId, todoId, todoLists) => {
let todoList = loadTodoList(+todoListId, todoLists);
let todo = loadTodo(+todoListId, +todoId, todoLists);
let todoIndex = todoList.findIndexOf(todo);
todoList.removeAt(todoIndex);
}

app.get('/', (req, res) => {
  res.redirect('/lists');
});

app.get('/lists', (req, res) => {
  res.render('lists', {
    todoLists: sortTodoLists(req.session.todoLists),
  });
});

app.get('/lists/new', (req, res) => {
  res.render('new-list');
});

app.get('/lists/:todoListId', (req, res, next) => {
  let todoListId = req.params.todoListId;
  let todoList = loadTodoList(+todoListId, req.session.todoLists);
  if (todoList === undefined) {
    next(new Error('Not found.'));
  } else {
    res.render('list', {
      todoList: todoList,
      todos: sortTodos(todoList),
    });
  }
});

app.get(`/lists/:todoListId/edit`, (req, res, next) => {
  let todoListId = req.params.todoListId;
  let todoList = loadTodoList(+todoListId, req.session.todoLists);

  if (!todoList) {
    next(new Error('Not found.'));
  } else {
    res.render('edit-list', {
      todoList
    });
  }
})

app.post('/lists',
  [
    body('todoListTitle')
      .trim()
      .isLength({ min: 1 })
      .withMessage('The list title is required.')
      .isLength({ max: 100 })
      .withMessage('List title must be between 1 and 100 characters long.')
      .custom((title, { req }) => {
        let todoLists = req.session.todoLists;
        let duplicate = todoLists.find(list => list.title === title);
        return duplicate === undefined;
      })
      .withMessage('List title must be unique.')
  ],

  (req, res) => {
    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash('error', message.msg));
      res.render('new-list', {
        flash: req.flash(),
        todoListTitle: req.body.todoListTitle,
      });
    }  else {
      req.session.todoLists.push(new TodoList(req.body.todoListTitle));
      req.flash('success', 'The todo list has been created.');
      res.redirect('/lists');
    }
  }
);

app.post('/lists/:todoListId/todos/:todoId/toggle', (req, res, next) => {
  let { todoListId, todoId } = { ...req.params };
  let todo = loadTodo(+todoListId, +todoId, req.session.todoLists);
  if (!todo) {
    next(new Error('Not found.'));
  } else {
    let title = todo.title;
    if (todo.isDone()) {
      todo.markUndone();
      req.flash('success', `'${title}' marked as NOT done!`);
    } else {
      todo.markDone();
      req.flash('success', `'${title}' marked done.`);
    }

    res.redirect(`/lists/${todoListId}`);
  }
});

app.post('/lists/:todoListId/todos/:todoId/destroy', (req, res, next) => {
  let { todoListId, todoId } = { ...req.params };
  let todo = loadTodo(+todoListId, +todoId, req.session.todoLists);

  if (!todo) {
    next(new Error('Not found.'));
  } else {
    deleteTodo(+todoListId, +todoId, req.session.todoLists);
    req.flash('success', `${todo.title} has been deleted.`);
    res.redirect(`/lists/${todoListId}`);
  }
});

app.post('/lists/:todoListId/complete_all', (req, res, next) => {
  let todoListId = req.params.todoListId;
  let todoList = loadTodoList(+todoListId, req.session.todoLists);

  if (!todoList) {
    next(new Error('Not found.'));
  } else {
    todoList.markAllDone();
    req.flash('success', 'All todos are completed!');
    res.redirect(`/lists/${todoListId}`);
  }
});

app.post('/lists/:todoListId/todos',
  [
    body('todoTitle')
      .trim()
      .isLength({ min: 1 })
      .withMessage('The todo title is required.')
      .isLength({ max: 100 })
      .withMessage('Todo title must be between 1 and 100 characters long.')
  ],

  (req, res, next) => {
    let todoListId = req.params.todoListId;
    let todoList = loadTodoList(+todoListId, req.session.todoLists);

    if (todoList === undefined) {
      next(new Error('Not found.'));
    } else {
      let todoTitle = req.body.todoTitle;
      let errors = validationResult(req);

      if (!errors.isEmpty()) {
        errors.array().forEach(message => req.flash('error', message.msg));
        res.render('list', {
          flash: req.flash(),
          todoList,
          todos: sortTodos(todoList),
          todoTitle,
        });
      } else {
        todoList.add(new Todo(todoTitle));
        req.flash('success', `${todoTitle} is added to the list.`);
        res.redirect(`/lists/${todoListId}`);
      }
    }
  }
);

app.post('/lists/:todoListId/destroy', (req, res) => {
  let todoListId = req.params.todoListId;
  let todoList = loadTodoList(+todoListId, req.session.todoLists);

  if (!todoList) {
    next(new Error('Not found.'));
  } else {
    deleteTodoList(+todoListId, req.session.todoLists);
    req.flash('success', `${todoList.title} has been deleted.`)
    res.redirect('/lists');
  }
});

app.post('/lists/:todoListId/edit', [
  body('todoListTitle')
    .trim()
    .isLength({ min: 1 })
    .withMessage('The list title is required.')
    .isLength({ max: 100 })
    .withMessage('List title must be between 1 and 100 characters long.')
    .custom((title, { req }) => {
      let todoLists = req.session.todoLists;
      let duplicate = todoLists.find(list => list.title === title);
      return duplicate === undefined;
    })
    .withMessage('List title must be unique.')
],

(req, res, next) => {
  let todoListId = req.params.todoListId;
  let todoList = loadTodoList(+todoListId, req.session.todoLists);

  if (!todoList) {
    next(new Error('Not found.'));
  } else {
    let errors = validationResult(req);
    let todoListTitle = req.body.todoListTitle;

    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash('error', message.msg));
      res.render('edit-list', {
        flash: req.flash(),
        todoList,
        todoListTitle,
      });
    } else {
      todoList.setTitle(todoListTitle);
      req.flash('success', 'The todo list has been renamed.');
      res.redirect(`/lists/${todoListId}`);
    }
  }
});

app.use((err, req, res, _next) => {
  console.log(err);
  res.status(404).send(err.message);
});

app.listen(port, host, () => {
  console.log(`Todos is listening on port ${port} of ${host}...`);
});